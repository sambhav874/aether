import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OptionLeg, OptionStrike } from "@/lib/options/option-chain-actions";

vi.mock("@/lib/options/option-chain-actions", () => ({
  fetchOptionChainExpiries: vi.fn(),
  fetchOptionChain: vi.fn(),
}));

import { fetchOptionChain, fetchOptionChainExpiries } from "@/lib/options/option-chain-actions";
import { getOptionChainSummary } from "./options";

const mockedExpiries = vi.mocked(fetchOptionChainExpiries);
const mockedChain = vi.mocked(fetchOptionChain);

function leg(oi: number, extra: Partial<OptionLeg> = {}): OptionLeg {
  return { ltp: 10, oi, iv: 20, volume: 100, bid: 9.5, ask: 10.5, delta: 0.5, gamma: 0.01, theta: -1, vega: 5, ...extra };
}

beforeEach(() => {
  mockedExpiries.mockReset();
  mockedChain.mockReset();
});

describe("getOptionChainSummary", () => {
  it("picks the nearest (first) expiry when none is given", async () => {
    mockedExpiries.mockResolvedValue({ status: "ok", expiries: ["2026-08-28", "2026-09-25"] });
    mockedChain.mockResolvedValue({ status: "ok", underlyingPrice: 100, strikes: [{ strike: 100, ce: null, pe: null }], totals: { ceOi: 0, ceVolume: 0, peOi: 0, peVolume: 0 } });

    const result = await getOptionChainSummary({ instrument: "NIFTY", strikeWindow: 10 });
    expect(result.status).toBe("ok");
    expect(mockedChain).toHaveBeenCalledWith("NIFTY", "2026-08-28");
    if (result.status === "ok") expect(result.data.expiry).toBe("2026-08-28");
  });

  it("computes max pain as the strike minimizing total option-writer payout, not just the highest-OI strike", async () => {
    // ce.oi=100 concentrated at 90 (hurts writers as spot rises above 90);
    // pe.oi=300 concentrated at 110 (hurts writers as spot falls below 110).
    // Hand-computed pain at each candidate: 90 -> 6000, 100 -> 4000, 110 -> 2000.
    const strikes: OptionStrike[] = [
      { strike: 90, ce: leg(100), pe: null },
      { strike: 100, ce: null, pe: null },
      { strike: 110, ce: null, pe: leg(300) },
    ];
    mockedChain.mockResolvedValue({ status: "ok", underlyingPrice: 101, strikes, totals: { ceOi: 100, ceVolume: 0, peOi: 300, peVolume: 0 } });

    const result = await getOptionChainSummary({ instrument: "NIFTY", expiry: "2026-08-28", strikeWindow: 10 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.maxPain).toBe(110);
    expect(result.data.pcr).toBeCloseTo(3, 10); // 300/100
  });

  it("leaves ivSkew null when the ATM strike has no call or put leg", async () => {
    const strikes: OptionStrike[] = [
      { strike: 90, ce: leg(100, { iv: 22 }), pe: null },
      { strike: 100, ce: null, pe: null }, // nearest to underlyingPrice=101 — no legs here
      { strike: 110, ce: null, pe: leg(300, { iv: 30 }) },
    ];
    mockedChain.mockResolvedValue({ status: "ok", underlyingPrice: 101, strikes, totals: { ceOi: 100, ceVolume: 0, peOi: 300, peVolume: 0 } });

    const result = await getOptionChainSummary({ instrument: "NIFTY", expiry: "2026-08-28", strikeWindow: 10 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.ivSkew).toBeNull();
  });

  it("computes ivSkew as ATM put IV minus ATM call IV when both legs exist", async () => {
    const strikes: OptionStrike[] = [{ strike: 100, ce: leg(50, { iv: 18 }), pe: leg(50, { iv: 24 }) }];
    mockedChain.mockResolvedValue({ status: "ok", underlyingPrice: 100, strikes, totals: { ceOi: 50, ceVolume: 0, peOi: 50, peVolume: 0 } });

    const result = await getOptionChainSummary({ instrument: "NIFTY", expiry: "2026-08-28", strikeWindow: 10 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.ivSkew).toBeCloseTo(6, 10); // 24 - 18
  });

  it("propagates unavailable from the expiry lookup without calling the chain endpoint", async () => {
    mockedExpiries.mockResolvedValue({ status: "unavailable", reason: "no permission" });

    const result = await getOptionChainSummary({ instrument: "SENSEX", strikeWindow: 10 });
    expect(result).toEqual({ status: "unavailable", reason: "no permission" });
    expect(mockedChain).not.toHaveBeenCalled();
  });

  it("never returns the raw full chain — only the ±strikeWindow band around ATM", async () => {
    const strikes: OptionStrike[] = Array.from({ length: 41 }, (_, i) => ({ strike: 80 + i, ce: leg(1), pe: leg(1) })); // 80..120
    mockedChain.mockResolvedValue({ status: "ok", underlyingPrice: 100, strikes, totals: { ceOi: 41, ceVolume: 0, peOi: 41, peVolume: 0 } });

    const result = await getOptionChainSummary({ instrument: "NIFTY", expiry: "2026-08-28", strikeWindow: 3 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.strikes).toHaveLength(7); // ATM (100) ± 3
    expect(result.data.strikes.map((s) => s.strike)).toEqual([97, 98, 99, 100, 101, 102, 103]);
  });
});
