import "server-only";
import { eq, isNotNull, and, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { brokerAccounts, positions } from "@/db/schema";
import { getRunner } from "@/lib/runners";

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
 * Deliberately additive-only — it does NOT close rows the broker stops
 * reporting. Some feeds are incomplete (Motilal's /getposition has no
 * verified delivery-holdings endpoint, see lib/runners/motilal/index.ts),
 * so treating "missing from this response" as "closed" risks wrongly
 * closing a real open position. Actual closes still go through
 * closePosition / the strategy engine.
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
