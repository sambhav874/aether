/**
 * The per-account fan-out every dispatch path performs.
 *
 * `strategy_accounts` is many-to-many with a size multiplier — this product
 * is a trade copier, so one signal becomes N broker orders. Each of the five
 * dispatch paths had its own hand-rolled copy of the same loop, which made
 * the shared failure modes invisible: a mid-loop timeout kills every account
 * after it, and the caller cannot tell a partial fan-out from a complete one.
 *
 * Pulling it into one place makes the loop testable without a database and
 * gives the queue migration a single seam to replace.
 */

export type AccountOutcome = {
  /** Whether this account actually reached the broker and got a fill. */
  executed: boolean;
  /** Human-readable per-account result, surfaced on the signal row. */
  message: string;
};

export type FanOutResult = {
  status: "received" | "rejected";
  resultMessage: string;
  executed: number;
  total: number;
  /** Per-account results, in input order — what the signals row cannot hold,
   * since it aggregates every account into one string. */
  outcomes: { accountId: string; executed: boolean; message: string }[];
};

export type FanOutOptions = {
  /**
   * Maximum accounts in flight at once.
   *
   * Defaults to 1 — strictly sequential, matching the behaviour this
   * replaced. Raising it is the Phase 3 change, and it has a ceiling that is
   * not about our own capacity: every broker rate-limits per account or API
   * key, so an unbounded fan-out trades a timeout for a throttle or a ban.
   */
  concurrency?: number;
};

/**
 * Runs `perAccount` for every account and aggregates the results.
 *
 * A throw from `perAccount` is contained to that account — one broker being
 * unreachable must not stop the others. Messages keep input order regardless
 * of completion order, so the signal row reads the same way whatever the
 * concurrency.
 */
export async function fanOutToAccounts<A extends { accountId: string }>(
  accounts: A[],
  perAccount: (account: A) => Promise<AccountOutcome>,
  options: FanOutOptions = {},
): Promise<FanOutResult> {
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 1));
  const outcomes = new Array<AccountOutcome>(accounts.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = next++;
      if (index >= accounts.length) return;
      const account = accounts[index];
      try {
        outcomes[index] = await perAccount(account);
      } catch (error) {
        outcomes[index] = {
          executed: false,
          message: `${account.accountId}: error — ${error instanceof Error ? error.message : "unknown"}`,
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, accounts.length) }, worker));

  const executed = outcomes.filter((o) => o.executed).length;
  return {
    status: executed > 0 ? "received" : "rejected",
    resultMessage: `dispatched to ${executed}/${accounts.length} accounts: ${outcomes.map((o) => o.message).join("; ")}`,
    executed,
    total: accounts.length,
    outcomes: accounts.map((account, i) => ({ accountId: account.accountId, ...outcomes[i] })),
  };
}
