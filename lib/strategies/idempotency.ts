import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { signalDispatches } from "@/db/schema";

export type ClaimableAccount = { accountId: string };

/**
 * Claims each (signal, account) pair before any broker call, and returns only
 * the accounts this attempt actually won.
 *
 * Nothing previously deduplicated a replayed webhook. TradingView retries,
 * and the moment the fan-out gains retry logic every transient failure
 * becomes a second live order on an account that already filled. The unique
 * index on (signal_id, account_id) makes that a conflict rather than a trade.
 *
 * onConflictDoNothing + returning gives an atomic claim in one round trip:
 * rows that come back are ours, rows that do not were claimed by an earlier
 * attempt. No read-then-write window for a concurrent replay to slip through.
 */
export async function claimAccountsForSignal<A extends ClaimableAccount>(
  signalId: string,
  accounts: A[],
): Promise<A[]> {
  if (accounts.length === 0) return [];

  const claimed = await db
    .insert(signalDispatches)
    .values(
      accounts.map((account) => ({
        id: crypto.randomUUID(),
        signalId,
        accountId: account.accountId,
      })),
    )
    .onConflictDoNothing({ target: [signalDispatches.signalId, signalDispatches.accountId] })
    .returning({ accountId: signalDispatches.accountId });

  const won = new Set(claimed.map((row) => row.accountId));
  return accounts.filter((account) => won.has(account.accountId));
}

/**
 * Records how each claimed account actually ended up.
 *
 * A claim on its own only prevents a second order; it says nothing about
 * whether the first one worked. Settling turns signal_dispatches into the
 * per-account audit the signals row cannot hold — it aggregates every account
 * into one string — and gives the queue migration the state it retries on.
 */
export async function settleDispatches(
  signalId: string,
  outcomes: { accountId: string; executed: boolean; message: string }[],
): Promise<void> {
  if (outcomes.length === 0) return;

  const settledAt = new Date();
  await Promise.all(
    outcomes.map((outcome) =>
      db
        .update(signalDispatches)
        .set({
          status: outcome.executed ? "executed" : "failed",
          message: outcome.message.slice(0, 500),
          settledAt,
        })
        .where(
          and(eq(signalDispatches.signalId, signalId), eq(signalDispatches.accountId, outcome.accountId)),
        ),
    ),
  );
}

/**
 * Releases claims that were taken but never dispatched, so a retry can pick
 * them up.
 *
 * Without this a crash between claiming and ordering locks those accounts out
 * of the signal permanently: the claim row exists, so every retry skips them,
 * and the order is never placed. Only ever releases rows still in `claimed` —
 * anything already settled stays settled, because releasing an executed row
 * is how a double order happens.
 */
export async function releaseUnsettledClaims(signalId: string, accountIds: string[]): Promise<void> {
  if (accountIds.length === 0) return;

  await db
    .delete(signalDispatches)
    .where(
      and(
        eq(signalDispatches.signalId, signalId),
        eq(signalDispatches.status, "claimed"),
        inArray(signalDispatches.accountId, accountIds),
      ),
    );
}
