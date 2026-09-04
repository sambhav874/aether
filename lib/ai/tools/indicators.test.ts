import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChartCandle } from "@/lib/market/india-chart";
import type { CandleChartResult } from "@/lib/market/india-chart";

vi.mock("./candle-source", () => ({
  fetchDailyCandles: vi.fn(),
}));

import { fetchDailyCandles } from "./candle-source";
import { computeIndicators, correlate } from "./indicators";
import { sma, rsi } from "./indicator-math";

const mockedFetch = vi.mocked(fetchDailyCandles);

function candlesFrom(closes: number[], startDate = "2025-01-01"): ChartCandle[] {
  const start = new Date(startDate);
  return closes.map((close, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return { time: d.toISOString().slice(0, 10), open: close, high: close, low: close, close };
  });
}

beforeEach(() => {
  mockedFetch.mockReset();
});

describe("computeIndicators", () => {
  it("matches the underlying pure-math functions for the same window", async () => {
    const closes = Array.from({ length: 260 }, (_, i) => 100 + Math.sin(i / 5) * 10 + i * 0.05);
    const candles = candlesFrom(closes);
    mockedFetch.mockResolvedValue({ status: "ok", candles } satisfies CandleChartResult);

    const result = await computeIndicators({ symbol: "TEST", kind: "equity", market: "us", indicators: ["sma20", "rsi14"] });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.data.values.sma20).toBeCloseTo(sma(closes, 20)!, 8);
    expect(result.data.values.rsi14).toBeCloseTo(rsi(closes, 14)!, 8);
  });

  it("propagates unavailable from the underlying source instead of inventing values", async () => {
    mockedFetch.mockResolvedValue({ status: "unavailable", reason: "NSE blocked the request" } satisfies CandleChartResult);

    const result = await computeIndicators({ symbol: "TEST", kind: "equity", market: "india", indicators: ["sma20"] });
    expect(result).toEqual({ status: "unavailable", reason: "NSE blocked the request" });
  });

  it("returns null (not a crash) for an indicator that needs more data than is available", async () => {
    mockedFetch.mockResolvedValue({ status: "ok", candles: candlesFrom([100, 101, 102]) });

    const result = await computeIndicators({ symbol: "TEST", kind: "equity", market: "us", indicators: ["sma200", "ret5y"] });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.values.sma200).toBeNull();
    expect(result.data.values.ret5y).toBeNull();
  });
});

describe("correlate", () => {
  it("rejects when the aligned overlap is shorter than the minimum, even on a long requested period", async () => {
    // Two series that barely overlap in date range despite a "1y" period request.
    mockedFetch.mockImplementation(async (symbol: string) => {
      if (symbol === "A") return { status: "ok", candles: candlesFrom(Array.from({ length: 50 }, (_, i) => 100 + i), "2025-01-01") };
      return { status: "ok", candles: candlesFrom(Array.from({ length: 50 }, (_, i) => 200 + i), "2025-06-01") };
    });

    const result = await correlate({
      symbols: [
        { symbol: "A", kind: "equity", market: "us" },
        { symbol: "B", kind: "equity", market: "us" },
      ],
      period: "1y",
    });
    expect(result.status).toBe("unavailable");
  });

  it("computes ~1.0 for two perfectly co-moving series with enough overlap", async () => {
    const base = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5 + Math.sin(i / 3) * 2);
    mockedFetch.mockImplementation(async (symbol: string) => {
      const multiplier = symbol === "A" ? 1 : 3;
      return { status: "ok", candles: candlesFrom(base.map((v) => v * multiplier)) };
    });

    const result = await correlate({
      symbols: [
        { symbol: "A", kind: "equity", market: "us" },
        { symbol: "B", kind: "equity", market: "us" },
      ],
      period: "3m",
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.matrix[0][1]).toBeCloseTo(1, 3);
    expect(result.data.matrix[0][0]).toBe(1);
  });

  it("propagates unavailable if any symbol's source fails", async () => {
    mockedFetch.mockImplementation(async (symbol: string) => {
      if (symbol === "A") return { status: "ok", candles: candlesFrom(Array.from({ length: 60 }, (_, i) => 100 + i)) };
      return { status: "unavailable", reason: "no chart data for B" };
    });

    const result = await correlate({
      symbols: [
        { symbol: "A", kind: "equity", market: "us" },
        { symbol: "B", kind: "equity", market: "us" },
      ],
      period: "3m",
    });
    expect(result).toEqual({ status: "unavailable", reason: "no chart data for B" });
  });
});
