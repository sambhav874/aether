import "server-only";
import { eq, isNotNull, and, ne, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { brokerAccounts, positions } from "@/db/schema";
import { getRunner } from "@/lib/runners";
import { stalePositionIds } from "@/lib/runners/reconcile";

export type SyncSummary = {
  total: number;
  synced: number;
  failed: number;
  errors: { accountId: string; message: string }[];
};

/**
 * Reconciles the broker's live positions/holdings for one account into our
 * `positions` table, keyed on (accountId, externalPositionId) — the same
 * key an app-placed order is inserted under (lib/strategies/execute.ts), so
 * this never duplicates a position we already opened ourselves; it only
 * fills in holdings that exist at the broker but not in our DB (bought
 * outside the app, or before the account was connected).
 *
 * Additive for every adapter, plus a reconciliation pass for the ones that
 * declare `reportsAllOpenPositions`. Where a feed is only partial (Motilal's
 * /getposition has no verified delivery-holdings endpoint, see
 * lib/runners/motilal/index.ts), "missing from this response" still means
 * nothing and no row is ever closed from it. Where the feed is complete
 * (MT5), a local row the broker no longer reports is genuinely closed, and
 * leaving it open forever makes exposure, KPIs and the engine's
 * concurrency checks operate on a position that does not exist.
 *
 * Actual closes still go through closePosition / the strategy engine; this
 * pass only catches positions that were closed outside the app.
 */
export async function syncPositions(
  accountId: string,
  workspaceId: string,
  provider: Parameters<typeof getRunner>[0],
): Promise<void> {
  const runner = await getRunner(provider);
  const live = await runner.getPositions(accountId);

  for (const p of live) {
    await db
      .insert(positions)
      .values({
        id: crypto.randomUUID(),
        workspaceId,
        accountId,
        market: p.market,
        symbol: p.symbol,
        side: p.side,
        entryPrice: p.entryPrice.toFixed(6),
        quantity: p.quantity.toFixed(6),
        filledQuantity: p.quantity.toFixed(6),
        status: "open",
        pnl: p.unrealizedPnl.toFixed(2),
        externalPositionId: p.externalPositionId,
        openedAt: p.openedAt,
      })
      .onConflictDoUpdate({
        target: [positions.accountId, positions.externalPositionId],
        set: {
          quantity: p.quantity.toFixed(6),
          filledQuantity: p.quantity.toFixed(6),
          entryPrice: p.entryPrice.toFixed(6),
          pnl: p.unrealizedPnl.toFixed(2),
          status: "open",
          closedAt: null,
          updatedAt: new Date(),
        },
      });
  }

  // Only adapters that guarantee a complete feed get here — see the
  // `reportsAllOpenPositions` note on BrokerRunner. Reaching this line also
  // means getPositions() resolved, so an empty list is a real "nothing
  // open", not a failed call (a throw propagates to the caller instead).
  if (!runner.reportsAllOpenPositions) return;

  const localOpen = await db
    .select({
      id: positions.id,
      externalPositionId: positions.externalPositionId,
      isPaper: positions.isPaper,
      openedAt: positions.openedAt,
    })
    .from(positions)
    .where(and(eq(positions.accountId, accountId), eq(positions.status, "open")));

  const staleIds = stalePositionIds(
    localOpen,
    live.map((p) => p.externalPositionId).filter((id): id is string => Boolean(id)),
    new Date(),
  );
  if (staleIds.length === 0) return;

  await db
    .update(positions)
    .set({
      status: "closed",
      closeReason: "reconciled_missing",
      closedAt: new Date(),
      // The true exit price and realised P&L are unknowable here — the
      // stored pnl was an unrealised snapshot, and presenting it as a
      // realised result would be a fabrication. Same rule the manual-close
      // path already follows: leave them null for a later source of truth.
      exitPrice: null,
      pnl: null,
      updatedAt: new Date(),
    })
    .where(inArray(positions.id, staleIds));
}

/**
 * Polls balance for every connected broker account across every workspace
 * and updates balance/equity/last_sync_at. Intended to run on a schedule
 * (Supabase pg_cron hitting /api/cron/sync-broker-accounts, or a Vercel
 * Cron) — see Phase 1 plan: "Background sync job (balance/positions poll)".
 */
export async function syncAllBrokerAccounts(): Promise<SyncSummary> {
  const accounts = await db
    .select({
      id: brokerAccounts.id,
      provider: brokerAccounts.provider,
      status: brokerAccounts.status,
      workspaceId: brokerAccounts.workspaceId,
    })
    .from(brokerAccounts)
    .where(
      and(isNotNull(brokerAccounts.credentialsEncrypted), ne(brokerAccounts.status, "disconnected")),
    );

  const summary: SyncSummary = { total: accounts.length, synced: 0, failed: 0, errors: [] };

  for (const account of accounts) {
    try {
      const runner = await getRunner(account.provider);
      const balance = await runner.getBalance(account.id);

      // A successful balance read doesn't confirm order-placement is
      // whitelisted (brokers often gate that more strictly than read-only
      // endpoints) — only the explicit "Mark as whitelisted" action
      // (integrations-actions.ts) should clear that status.
      const nextStatus = account.status === "whitelist_pending" ? "whitelist_pending" : "connected";

      await db
        .update(brokerAccounts)
        .set({
          balance: balance.balance.toFixed(2),
          equity: balance.equity.toFixed(2),
          currency: balance.currency,
          // Only overwrite when this adapter actually reported details, so a
          // provider that reports none can't blank out what an earlier sync saved.
          ...(balance.details ? { metadata: balance.details } : {}),
          status: nextStatus,
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(brokerAccounts.id, account.id));

      // Best-effort — a positions-sync failure shouldn't flip a healthy
      // account into needs_reauth when the balance read above just succeeded.
      try {
        await syncPositions(account.id, account.workspaceId, account.provider);
      } catch {
        // swallow — balance sync above already succeeded for this account
      }

      summary.synced += 1;
    } catch (error) {
      summary.failed += 1;
      const message = error instanceof Error ? error.message : "Unknown sync error";
      summary.errors.push({ accountId: account.id, message });

      // Auth/token failures are the common case (Zerodha/Dhan daily expiry) —
      // surface it as "needs_reauth" rather than a generic disconnect.
      await db
        .update(brokerAccounts)
        .set({ status: "needs_reauth", updatedAt: new Date() })
        .where(eq(brokerAccounts.id, account.id));
    }
  }

  return summary;
}
