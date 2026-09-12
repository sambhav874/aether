import { afterEach, describe, expect, it, vi } from "vitest";

const claim = vi.hoisted(() => ({
  returned: [] as { accountId: string }[],
  inserted: [] as unknown[],
}));

vi.mock("@/db/client", () => ({
  db: {
    insert: () => ({
      values: (v: unknown[]) => {
        claim.inserted = v;
        return {
          onConflictDoNothing: () => ({ returning: async () => claim.returned }),
        };
      },
    }),
  },
}));

const { claimAccountsForSignal } = await import("@/lib/strategies/idempotency");

afterEach(() => {
  claim.returned = [];
  claim.inserted = [];
});

describe("claimAccountsForSignal", () => {
  it("returns every account on a first delivery", async () => {
    claim.returned = [{ accountId: "a" }, { accountId: "b" }];
    const result = await claimAccountsForSignal("sig-1", [{ accountId: "a" }, { accountId: "b" }]);
    expect(result.map((r) => r.accountId)).toEqual(["a", "b"]);
  });

  it("returns nothing when the whole signal is a replay", async () => {
    // TradingView retries. Without this the second delivery places a second
    // live order on an account that already filled.
    claim.returned = [];
    const result = await claimAccountsForSignal("sig-1", [{ accountId: "a" }, { accountId: "b" }]);
    expect(result).toEqual([]);
  });

  it("returns only the accounts this attempt won", async () => {
    // The realistic retry: the first attempt died partway, so some accounts
    // are already claimed and must not be dispatched again.
    claim.returned = [{ accountId: "c" }];
    const result = await claimAccountsForSignal("sig-1", [
      { accountId: "a" },
      { accountId: "b" },
      { accountId: "c" },
    ]);
    expect(result.map((r) => r.accountId)).toEqual(["c"]);
  });

  it("preserves the caller's account objects, not just the ids", async () => {
    claim.returned = [{ accountId: "a" }];
    const result = await claimAccountsForSignal("sig-1", [
      { accountId: "a", provider: "motilal", multiplier: 2 },
    ]);
    expect(result[0]).toMatchObject({ provider: "motilal", multiplier: 2 });
  });

  it("claims one row per account against the signal", async () => {
    claim.returned = [{ accountId: "a" }, { accountId: "b" }];
    await claimAccountsForSignal("sig-9", [{ accountId: "a" }, { accountId: "b" }]);
    expect(claim.inserted).toHaveLength(2);
    expect(claim.inserted).toEqual([
      expect.objectContaining({ signalId: "sig-9", accountId: "a" }),
      expect.objectContaining({ signalId: "sig-9", accountId: "b" }),
    ]);
  });

  it("does not touch the database for an empty account list", async () => {
    const result = await claimAccountsForSignal("sig-1", []);
    expect(result).toEqual([]);
    expect(claim.inserted).toEqual([]);
  });
});
