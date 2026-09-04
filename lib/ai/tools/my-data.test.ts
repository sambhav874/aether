import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PositionRow } from "@/lib/positions/types";

vi.mock("@/lib/positions/queries", () => ({
  getAllPositions: vi.fn(),
  getPositions: vi.fn(),
}));

import { getAllPositions, getPositions } from "@/lib/positions/queries";
import { getMyPositions, analyzeMyPerformance } from "./my-data";

const mockedAll = vi.mocked(getAllPositions);
const mockedByMarket = vi.mocked(getPositions);

let idCounter = 0;
function position(overrides: Partial<PositionRow>): PositionRow {
  idCounter += 1;
  return {
    id: `pos_${idCounter}`,
    accountId: "acct_1",
    strategyId: "strat_1",
    market: "indian_equity",
    symbol: "TCS",
    side: "long",
    entryPrice: 100,
    exitPrice: 110,
    quantity: 10,
    filledQuantity: 10,
    status: "closed",
    closeReason: null,
    pnl: 100,
    rr: 1,
    sl: null,
    strategyLabel: "Momentum",
    accountLabel: "Zerodha Main",
    provider: "zerodha",
    basketName: null,
    openedAt: new Date("2026-08-01T04:00:00Z"), // Saturday, 04:00 UTC
    closedAt: new Date("2026-08-01T10:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  mockedAll.mockReset();
  mockedByMarket.mockReset();
});

describe("getMyPositions", () => {
  it("filters by status, symbol, and strategyId", async () => {
    mockedAll.mockResolvedValue([
      position({ status: "open", symbol: "TCS" }),
      position({ status: "closed", symbol: "TCS" }),
      position({ status: "closed", symbol: "INFY", strategyId: "strat_2" }),
    ]);

    const result = await getMyPositions({ status: "closed", symbol: "TCS", limit: 20 }, { workspaceId: "ws_1" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.positions).toHaveLength(1);
    expect(result.data.positions[0].status).toBe("closed");
  });

  it("computes exposure and unrealized PnL per currency, never summed across markets", async () => {
    mockedAll.mockResolvedValue([
      position({ status: "open", market: "indian_equity", entryPrice: 100, quantity: 10, pnl: 50 }), // INR: 1000 exposure
      position({ status: "open", market: "forex", entryPrice: 1.1, quantity: 1000, pnl: -20 }), // USD: 1100 exposure
      position({ status: "closed" }), // excluded from open-only summary
    ]);

    const result = await getMyPositions({ limit: 20 }, { workspaceId: "ws_1" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.summary.open).toBe(2);
    expect(result.data.summary.exposure.INR).toBeCloseTo(1000, 6);
    expect(result.data.summary.exposure.USD).toBeCloseTo(1100, 6);
    expect(result.data.summary.unrealizedPnl.INR).toBe(50);
    expect(result.data.summary.unrealizedPnl.USD).toBe(-20);
  });

  it("routes to the market-scoped query when a market filter is given", async () => {
    mockedByMarket.mockResolvedValue([position({ market: "forex" })]);
    await getMyPositions({ market: "forex", limit: 20 }, { workspaceId: "ws_1" });
    expect(mockedByMarket).toHaveBeenCalledWith("ws_1", "forex");
    expect(mockedAll).not.toHaveBeenCalled();
  });

  it("respects the limit", async () => {
    mockedAll.mockResolvedValue(Array.from({ length: 5 }, () => position({})));
    const result = await getMyPositions({ limit: 2 }, { workspaceId: "ws_1" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.positions).toHaveLength(2);
  });
});

describe("analyzeMyPerformance", () => {
  it("excludes trades outside the requested period", async () => {
    const now = Date.now();
    mockedAll.mockResolvedValue([
      position({ closedAt: new Date(now - 2 * 24 * 60 * 60 * 1000) }), // within 7d
      position({ closedAt: new Date(now - 30 * 24 * 60 * 60 * 1000) }), // outside 7d
    ]);

    const result = await analyzeMyPerformance({ dimension: "overall", period: "7d" }, { workspaceId: "ws_1" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.tradesConsidered).toBe(1);
  });

  it("breaks down by weekday, side, and strategy without mixing currencies", async () => {
    mockedAll.mockResolvedValue([
      position({ market: "indian_equity", side: "long", strategyLabel: "Momentum", pnl: 100 }),
      position({ market: "indian_equity", side: "short", strategyLabel: "Reversal", pnl: -40 }),
      position({ market: "forex", side: "long", strategyLabel: "FX Trend", pnl: 30 }),
    ]);

    const bySide = await analyzeMyPerformance({ dimension: "side", period: "all" }, { workspaceId: "ws_1" });
    expect(bySide.status).toBe("ok");
    if (bySide.status !== "ok") return;
    expect(bySide.data.breakdown!.INR.map((r) => r.key).sort()).toEqual(["long", "short"]);
    expect(bySide.data.breakdown!.USD.map((r) => r.key)).toEqual(["long"]);

    const byStrategy = await analyzeMyPerformance({ dimension: "strategy", period: "all" }, { workspaceId: "ws_1" });
    expect(byStrategy.status).toBe("ok");
    if (byStrategy.status !== "ok") return;
    expect(byStrategy.data.breakdown!.INR.map((r) => r.key).sort()).toEqual(["Momentum", "Reversal"]);
  });

  it("has no breakdown for dimension=overall (kpis only)", async () => {
    mockedAll.mockResolvedValue([position({})]);
    const result = await analyzeMyPerformance({ dimension: "overall", period: "all" }, { workspaceId: "ws_1" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.breakdown).toBeNull();
    expect(result.data.kpis.totalTrades).toBe(1);
  });

  it("groups an unlabeled strategy under a clear placeholder rather than dropping it", async () => {
    mockedAll.mockResolvedValue([position({ strategyLabel: null })]);
    const result = await analyzeMyPerformance({ dimension: "strategy", period: "all" }, { workspaceId: "ws_1" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.breakdown!.INR[0].key).toBe("(no strategy)");
  });
});
