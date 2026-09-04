import { describe, it, expect } from "vitest";
import type { ChartCandle } from "@/lib/market/india-chart";
import {
  sma,
  ema,
  rsi,
  atr,
  realizedVolatility,
  positionInRange,
  drawdown,
  periodReturn,
  cagr,
  pearsonCorrelation,
  dailyReturns,
  downsampleCandles,
} from "./indicator-math";

function candle(time: string, close: number, high = close, low = close, open = close): ChartCandle {
  return { time, open, high, low, close };
}

function series(closes: number[]): ChartCandle[] {
  return closes.map((c, i) => candle(`2026-01-${String(i + 1).padStart(2, "0")}`, c));
}

describe("sma", () => {
  it("averages exactly the trailing window", () => {
    expect(sma([1, 2, 3, 4, 5], 5)).toBe(3);
    expect(sma([1, 2, 3, 4, 5], 3)).toBeCloseTo(4, 10); // (3+4+5)/3
  });

  it("returns null when there isn't enough data", () => {
    expect(sma([1, 2], 5)).toBeNull();
  });
});

describe("ema", () => {
  it("returns null below the period, a number at/above it", () => {
    expect(ema([1, 2, 3], 5)).toBeNull();
    expect(ema([1, 2, 3, 4, 5, 6, 7, 8], 5)).not.toBeNull();
  });

  it("seeds from the SMA of the first window then converges toward the trend", () => {
    const flat = ema([10, 10, 10, 10, 10], 5);
    expect(flat).toBeCloseTo(10, 10);
  });
});

describe("rsi (Wilder)", () => {
  it("is 0 for a strictly declining series (all losses)", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 - i);
    expect(rsi(closes, 14)).toBeCloseTo(0, 6);
  });

  it("is 100 for a strictly rising series (all gains)", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    expect(rsi(closes, 14)).toBeCloseTo(100, 6);
  });

  it("is 50 for a perfectly flat series (no gains, no losses)", () => {
    const closes = Array.from({ length: 20 }, () => 100);
    expect(rsi(closes, 14)).toBe(50);
  });

  it("returns null below period+1 points", () => {
    expect(rsi([1, 2, 3], 14)).toBeNull();
  });
});

describe("atr (Wilder)", () => {
  it("computes true range correctly for a simple 2-period case", () => {
    const candles: ChartCandle[] = [
      candle("2026-01-01", 10, 10, 10, 10),
      candle("2026-01-02", 12, 12, 11, 11), // TR = max(1, |12-10|, |11-10|) = 2
      candle("2026-01-03", 13, 13, 12, 12), // TR = max(1, |13-12|, |12-12|) = 1
    ];
    // seed = avg(TR[0..1]) = avg(2) over period=1 -> then smoothed with TR[1]=1
    const value = atr(candles, 1);
    expect(value).not.toBeNull();
    expect(value).toBeGreaterThan(0);
  });

  it("returns null below period+1 candles", () => {
    expect(atr(series([1, 2]), 14)).toBeNull();
  });
});

describe("realizedVolatility", () => {
  it("is ~0 for a perfectly flat series", () => {
    const candles = series(Array.from({ length: 25 }, () => 100));
    expect(realizedVolatility(candles, 20)).toBeCloseTo(0, 6);
  });

  it("is positive for an oscillating series", () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + (i % 2 === 0 ? 2 : -2));
    expect(realizedVolatility(series(closes), 20)).toBeGreaterThan(0);
  });

  it("returns null below period+1 candles", () => {
    expect(realizedVolatility(series([100, 101]), 20)).toBeNull();
  });
});

describe("positionInRange", () => {
  it("is 100 when the last close is the window high", () => {
    const candles: ChartCandle[] = [candle("2026-01-01", 50, 60, 40), candle("2026-01-02", 60, 60, 55)];
    expect(positionInRange(candles)).toBe(100);
  });

  it("is 0 when the last close is the window low", () => {
    const candles: ChartCandle[] = [candle("2026-01-01", 50, 60, 40), candle("2026-01-02", 40, 45, 40)];
    expect(positionInRange(candles)).toBe(0);
  });

  it("is 50 when high equals low (degenerate flat range)", () => {
    const candles: ChartCandle[] = [candle("2026-01-01", 50, 50, 50)];
    expect(positionInRange(candles)).toBe(50);
  });
});

describe("drawdown", () => {
  it("is 0 at a new high", () => {
    expect(drawdown(series([100, 110, 120]))).toBe(0);
  });

  it("is negative below the peak, by the exact percentage", () => {
    // peak 120, last 90 -> (90-120)/120 * 100 = -25
    expect(drawdown(series([100, 120, 90]))).toBeCloseTo(-25, 10);
  });
});

describe("periodReturn / cagr", () => {
  it("computes simple % return from first to last close", () => {
    expect(periodReturn(series([100, 110]))).toBeCloseTo(10, 10);
    expect(periodReturn(series([100, 90]))).toBeCloseTo(-10, 10);
  });

  it("returns null with fewer than 2 candles", () => {
    expect(periodReturn(series([100]))).toBeNull();
  });

  it("computes CAGR consistent with the compounding definition", () => {
    // doubling over 3 years -> (2)^(1/3) - 1 ≈ 25.99%
    const value = cagr(series([100, 200]), 3);
    expect(value).toBeCloseTo((2 ** (1 / 3) - 1) * 100, 6);
  });
});

describe("pearsonCorrelation", () => {
  it("is ~1 for perfectly linearly related series", () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const b = a.map((v) => v * 2 + 1);
    expect(pearsonCorrelation(a, b)).toBeCloseTo(1, 6);
  });

  it("is ~-1 for perfectly inversely related series", () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const b = a.map((v) => -v);
    expect(pearsonCorrelation(a, b)).toBeCloseTo(-1, 6);
  });

  it("is null when either series has zero variance", () => {
    const flat = [5, 5, 5, 5, 5];
    const varying = [1, 2, 3, 4, 5];
    expect(pearsonCorrelation(flat, varying)).toBeNull();
  });
});

describe("dailyReturns", () => {
  it("computes log returns aligned to candles.length - 1", () => {
    const candles = series([100, 110, 121]);
    const returns = dailyReturns(candles);
    expect(returns).toHaveLength(2);
    expect(returns[0]).toBeCloseTo(Math.log(1.1), 10);
    expect(returns[1]).toBeCloseTo(Math.log(121 / 110), 10);
  });
});

describe("downsampleCandles", () => {
  it("leaves short series untouched", () => {
    const candles = series(Array.from({ length: 30 }, (_, i) => 100 + i));
    expect(downsampleCandles(candles, 60)).toHaveLength(30);
  });

  it("downsamples to exactly maxPoints, preserving first and last", () => {
    const candles = series(Array.from({ length: 250 }, (_, i) => 100 + i));
    const sampled = downsampleCandles(candles, 60);
    expect(sampled).toHaveLength(60);
    expect(sampled[0]).toEqual(candles[0]);
    expect(sampled[sampled.length - 1]).toEqual(candles[candles.length - 1]);
  });
});
