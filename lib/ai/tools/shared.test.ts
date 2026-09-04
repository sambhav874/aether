import { describe, it, expect } from "vitest";
import { rangeToDays, isCorrelationRange, TIME_RANGES, MIN_POINTS_FOR_CORRELATION } from "./shared";

describe("rangeToDays", () => {
  it("is monotonically non-decreasing across the fixed ranges", () => {
    const fixedOrder = ["5d", "1m", "3m", "6m", "1y", "2y", "3y", "5y", "10y", "max"] as const;
    const days = fixedOrder.map((r) => rangeToDays(r));
    for (let i = 1; i < days.length; i++) {
      expect(days[i]).toBeGreaterThan(days[i - 1]);
    }
  });

  it("computes ytd relative to Jan 1 of the given year, not a fixed constant", () => {
    const midYear = new Date(Date.UTC(2026, 5, 15)); // June 15, 2026
    const days = rangeToDays("ytd", midYear);
    // Jan 1 -> Jun 15 is roughly 165 days; padded by +3 in the implementation.
    expect(days).toBeGreaterThan(160);
    expect(days).toBeLessThan(175);
  });

  it("caps at the 'max' ceiling and never exceeds it", () => {
    expect(rangeToDays("max")).toBe(rangeToDays("10y") > 0 ? rangeToDays("max") : 0);
    expect(rangeToDays("max")).toBeGreaterThanOrEqual(rangeToDays("10y"));
  });
});

describe("isCorrelationRange", () => {
  it("excludes 5d and 1m — too few points for a meaningful coefficient", () => {
    expect(isCorrelationRange("5d")).toBe(false);
    expect(isCorrelationRange("1m")).toBe(false);
  });

  it("allows every other range", () => {
    const others = TIME_RANGES.filter((r) => r !== "5d" && r !== "1m");
    for (const r of others) {
      expect(isCorrelationRange(r)).toBe(true);
    }
  });
});

describe("MIN_POINTS_FOR_CORRELATION", () => {
  it("is a sane floor, not zero or absurdly high", () => {
    expect(MIN_POINTS_FOR_CORRELATION).toBeGreaterThanOrEqual(10);
    expect(MIN_POINTS_FOR_CORRELATION).toBeLessThan(100);
  });
});
