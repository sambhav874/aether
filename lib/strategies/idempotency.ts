import "server-only";
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
