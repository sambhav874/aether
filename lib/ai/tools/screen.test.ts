import { describe, it, expect, vi, beforeEach } from "vitest";

const { limitMock, orderByMock, whereMock, fromMock, selectMock } = vi.hoisted(() => {
  const limitMock = vi.fn();
  const orderByMock = vi.fn(() => ({ limit: limitMock }));
  const whereMock = vi.fn(() => ({ orderBy: orderByMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  return { limitMock, orderByMock, whereMock, fromMock, selectMock: vi.fn(() => ({ from: fromMock })) };
});

vi.mock("@/db/client", () => ({ db: { select: selectMock } }));

import { screenStocks } from "./screen";

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    symbol: "AAPL",
    exchange: "US",
    name: "Apple",
    sector: "Technology",
    industry: "Consumer Electronics",
    marketCap: "3000000000000.00",
    pe: "28.4000",
    pb: "45.1000",
    roe: "150.0000",
    revenueGrowth: "5.0000",
    profitMargin: "25.0000",
    debtToEquity: "1.5000",
    dividendYield: "0.5000",
    beta: "1.2000",
    ret1y: null,
    refreshedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  limitMock.mockReset();
  orderByMock.mockClear();
  whereMock.mockClear();
  fromMock.mockClear();
  selectMock.mockClear();
});

describe("screenStocks", () => {
  it("rejects universe='custom' with no symbols", async () => {
    const result = await screenStocks({ universe: "custom", filters: [], limit: 25 });
    expect(result.status).toBe("unavailable");
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("converts numeric() string columns to real numbers in the output", async () => {
    limitMock.mockResolvedValue([row()]);

    const result = await screenStocks({ universe: "us_equity", filters: [], limit: 25 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.matches[0].pe).toBe(28.4);
    expect(result.data.matches[0].marketCap).toBe(3_000_000_000_000);
    expect(typeof result.data.matches[0].pe).toBe("number");
  });

  it("reports asOf as the oldest refreshedAt among the matches, so staleness is visible", async () => {
    limitMock.mockResolvedValue([row({ symbol: "A", refreshedAt: new Date("2026-08-10T00:00:00Z") }), row({ symbol: "B", refreshedAt: new Date("2026-08-01T00:00:00Z") })]);

    const result = await screenStocks({ universe: "all", filters: [], limit: 25 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.asOf).toBe("2026-08-01T00:00:00.000Z");
  });

  it("returns an empty ok result (not unavailable) when nothing matches", async () => {
    limitMock.mockResolvedValue([]);

    const result = await screenStocks({ universe: "us_equity", filters: [{ metric: "pe", op: "lt", value: 0 }], limit: 25 });
    expect(result).toEqual({ status: "ok", data: { matches: [], total: 0, asOf: null } });
  });

  it("passes filters, universe, and sort through to the query builder without throwing", async () => {
    limitMock.mockResolvedValue([row()]);

    await screenStocks({
      universe: "india_equity",
      filters: [
        { metric: "pe", op: "lt", value: 25 },
        { metric: "roe", op: "gte", value: 15 },
      ],
      sort: { metric: "marketCap", dir: "desc" },
      limit: 10,
    });

    expect(whereMock).toHaveBeenCalledTimes(1);
    expect(orderByMock).toHaveBeenCalledTimes(1);
    expect(limitMock).toHaveBeenCalledWith(10);
  });

  it("accepts an explicit symbol list for universe='custom'", async () => {
    limitMock.mockResolvedValue([row({ symbol: "RELIANCE.NS" })]);

    const result = await screenStocks({ universe: "custom", symbols: ["RELIANCE.NS", "TCS.NS"], filters: [], limit: 25 });
    expect(result.status).toBe("ok");
    expect(whereMock).toHaveBeenCalledTimes(1);
  });
});
