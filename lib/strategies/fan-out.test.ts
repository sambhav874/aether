import { describe, expect, it, vi } from "vitest";
import { fanOutToAccounts } from "@/lib/strategies/fan-out";

const accounts = (...ids: string[]) => ids.map((accountId) => ({ accountId }));
const ok = (id: string) => ({ executed: true, message: `${id}: executed` });

describe("fanOutToAccounts", () => {
  it("reports received when at least one account filled", async () => {
    const result = await fanOutToAccounts(accounts("a", "b"), async (acc) => ok(acc.accountId));
    expect(result.status).toBe("received");
    expect(result.executed).toBe(2);
    expect(result.resultMessage).toBe("dispatched to 2/2 accounts: a: executed; b: executed");
  });

  it("reports rejected only when every account failed", async () => {
    const result = await fanOutToAccounts(accounts("a", "b"), async (acc) => ({
      executed: false,
      message: `${acc.accountId}: rejected`,
    }));
    expect(result.status).toBe("rejected");
    expect(result.executed).toBe(0);
  });

  it("still reports received on a partial fill", async () => {
    const result = await fanOutToAccounts(accounts("a", "b", "c"), async (acc) =>
      acc.accountId === "b" ? { executed: false, message: "b: rejected" } : ok(acc.accountId),
    );
    expect(result.status).toBe("received");
    expect(result.executed).toBe(2);
    expect(result.total).toBe(3);
  });

  it("contains a throw to the account that threw", async () => {
    // One unreachable broker must not stop the rest — the behaviour the
    // per-path try/catch blocks provided, now in one place.
    const result = await fanOutToAccounts(accounts("a", "b", "c"), async (acc) => {
      if (acc.accountId === "b") throw new Error("connection reset");
      return ok(acc.accountId);
    });
    expect(result.executed).toBe(2);
    expect(result.resultMessage).toContain("b: error — connection reset");
    expect(result.resultMessage).toContain("c: executed");
  });

  it("labels a non-Error throw rather than losing it", async () => {
    const result = await fanOutToAccounts(accounts("a"), async () => {
      throw "socket closed";
    });
    expect(result.resultMessage).toContain("a: error — unknown");
  });

  it("runs strictly sequentially by default", async () => {
    const inFlight: string[] = [];
    let peak = 0;
    await fanOutToAccounts(accounts("a", "b", "c"), async (acc) => {
      inFlight.push(acc.accountId);
      peak = Math.max(peak, inFlight.length);
      await new Promise((r) => setTimeout(r, 1));
      inFlight.pop();
      return ok(acc.accountId);
    });
    expect(peak).toBe(1);
  });

  it("never exceeds the configured concurrency", async () => {
    // The ceiling exists because brokers rate-limit per account, not because
    // of our own capacity.
    let inFlight = 0;
    let peak = 0;
    await fanOutToAccounts(
      accounts(...Array.from({ length: 20 }, (_, i) => `a${i}`)),
      async (acc) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight -= 1;
        return ok(acc.accountId);
      },
      { concurrency: 4 },
    );
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it("keeps message order stable under concurrency", async () => {
    // The signal row must read the same however the work was scheduled, so
    // raising concurrency is not a user-visible change.
    const result = await fanOutToAccounts(
      accounts("a", "b", "c", "d"),
      async (acc) => {
        // Reverse the completion order relative to input order.
        await new Promise((r) => setTimeout(r, acc.accountId === "a" ? 8 : 1));
        return ok(acc.accountId);
      },
      { concurrency: 4 },
    );
    expect(result.resultMessage).toBe(
      "dispatched to 4/4 accounts: a: executed; b: executed; c: executed; d: executed",
    );
  });

  it("visits every account exactly once", async () => {
    const seen = new Set<string>();
    const perAccount = vi.fn(async (acc: { accountId: string }) => {
      seen.add(acc.accountId);
      return ok(acc.accountId);
    });
    await fanOutToAccounts(accounts("a", "b", "c", "d", "e"), perAccount, { concurrency: 3 });
    expect(perAccount).toHaveBeenCalledTimes(5);
    expect(seen.size).toBe(5);
  });

  it("handles an empty account list without claiming success", async () => {
    const result = await fanOutToAccounts([], async () => ok("never"));
    expect(result.status).toBe("rejected");
    expect(result.total).toBe(0);
  });

  it("treats a nonsensical concurrency as sequential", async () => {
    for (const concurrency of [0, -5, 0.4]) {
      const result = await fanOutToAccounts(accounts("a", "b"), async (acc) => ok(acc.accountId), { concurrency });
      expect(result.executed).toBe(2);
    }
  });
});

describe("fanOutToAccounts outcomes", () => {
  it("reports each account's own result, keyed by account", async () => {
    // The signals row aggregates everything into one string; settling a claim
    // needs to know which specific account did what.
    const result = await fanOutToAccounts(accounts("a", "b", "c"), async (acc) =>
      acc.accountId === "b" ? { executed: false, message: "b: rejected" } : ok(acc.accountId),
    );
    expect(result.outcomes).toEqual([
      { accountId: "a", executed: true, message: "a: executed", durationMs: expect.any(Number) },
      { accountId: "b", executed: false, message: "b: rejected", durationMs: expect.any(Number) },
      { accountId: "c", executed: true, message: "c: executed", durationMs: expect.any(Number) },
    ]);
  });

  it("reports a thrown account as not executed", async () => {
    const result = await fanOutToAccounts(accounts("a"), async () => {
      throw new Error("broker down");
    });
    expect(result.outcomes).toEqual([
      { accountId: "a", executed: false, message: "a: error — broker down", durationMs: expect.any(Number) },
    ]);
  });

  it("keeps outcomes in input order under concurrency", async () => {
    const result = await fanOutToAccounts(
      accounts("a", "b", "c"),
      async (acc) => {
        await new Promise((r) => setTimeout(r, acc.accountId === "a" ? 6 : 1));
        return ok(acc.accountId);
      },
      { concurrency: 3 },
    );
    expect(result.outcomes.map((o) => o.accountId)).toEqual(["a", "b", "c"]);
  });

  it("times each account and the whole fan-out", async () => {
    const result = await fanOutToAccounts(
      accounts("a", "b"),
      async (acc) => {
        await new Promise((r) => setTimeout(r, acc.accountId === "a" ? 20 : 1));
        return ok(acc.accountId);
      },
      { concurrency: 2 },
    );
    expect(result.outcomes[0].durationMs).toBeGreaterThanOrEqual(15);
    // Parallel: the total tracks the slowest account, not the sum.
    expect(result.durationMs).toBeLessThan(result.outcomes[0].durationMs + 15);
  });
});
