import { describe, expect, it } from "vitest";
import { resolveAbsolutePrice, riskBasedStop, roundOptionTick } from "@/lib/strategies/execute";

describe("roundOptionTick", () => {
  it("leaves an already-valid tick price alone", () => {
    // Regression: 0.15/0.05 is 2.9999999999999996 in floating point, so the
    // previous implementation floored a valid BUY limit a full tick down to
    // 0.10 — under the market, never filling. Brokers quote on the grid, so
    // exact tick prices are the common input, not the edge case.
    for (const price of [0.15, 0.35, 1.15, 2.3, 12.45, 10.05, 150.15]) {
      expect(roundOptionTick(price, "long")).toBeCloseTo(price, 10);
      expect(roundOptionTick(price, "short")).toBeCloseTo(price, 10);
    }
  });

  it("rounds a BUY down so it never pays above the requested price", () => {
    expect(roundOptionTick(10.07, "long")).toBeCloseTo(10.05, 10);
    expect(roundOptionTick(10.09, "long")).toBeCloseTo(10.05, 10);
    expect(roundOptionTick(0.19, "long")).toBeCloseTo(0.15, 10);
  });

  it("rounds a SELL up so it never accepts below the requested price", () => {
    expect(roundOptionTick(10.07, "short")).toBeCloseTo(10.1, 10);
    expect(roundOptionTick(10.01, "short")).toBeCloseTo(10.05, 10);
    expect(roundOptionTick(0.11, "short")).toBeCloseTo(0.15, 10);
  });

  it("holds the directional invariant across the grid", () => {
    for (let paise = 5; paise <= 5000; paise += 1) {
      const price = paise / 100;
      expect(roundOptionTick(price, "long")).toBeLessThanOrEqual(price + 1e-9);
      expect(roundOptionTick(price, "short")).toBeGreaterThanOrEqual(price - 1e-9);
    }
  });

  it("always lands on the 0.05 grid", () => {
    for (const price of [0.13, 7.77, 123.46, 0.02, 99.99]) {
      for (const side of ["long", "short"] as const) {
        expect(Math.round(roundOptionTick(price, side) * 100) % 5).toBe(0);
      }
    }
  });

  it("never drifts more than one tick from the request", () => {
    for (const price of [0.13, 7.77, 123.46, 99.99, 2.31]) {
      for (const side of ["long", "short"] as const) {
        expect(Math.abs(roundOptionTick(price, side) - price)).toBeLessThan(0.05);
      }
    }
  });
});

describe("riskBasedStop", () => {
  it("puts a long's stop below entry", () => {
    expect(riskBasedStop(100, "long", 2)).toBeCloseTo(98, 10);
  });

  it("puts a short's stop above entry", () => {
    expect(riskBasedStop(100, "short", 2)).toBeCloseTo(102, 10);
  });

  it("scales the distance with the entry price, not a fixed amount", () => {
    expect(riskBasedStop(2000, "long", 1)).toBeCloseTo(1980, 10);
    expect(riskBasedStop(50, "long", 1)).toBeCloseTo(49.5, 10);
  });

  it("returns entry when no risk is configured", () => {
    expect(riskBasedStop(100, "long", 0)).toBeCloseTo(100, 10);
  });
});

describe("resolveAbsolutePrice", () => {
  it("passes an explicit PRICE straight through, whatever the side", () => {
    expect(resolveAbsolutePrice("97.5", "PRICE", 100, "long", "sl")).toBeCloseTo(97.5, 10);
    expect(resolveAbsolutePrice("97.5", "PRICE", 100, "short", "target")).toBeCloseTo(97.5, 10);
  });

  it("moves a long's stop down and its target up", () => {
    expect(resolveAbsolutePrice("5", "POINTS", 100, "long", "sl")).toBeCloseTo(95, 10);
    expect(resolveAbsolutePrice("5", "POINTS", 100, "long", "target")).toBeCloseTo(105, 10);
  });

  it("mirrors that for a short", () => {
    // A short profits as price falls, so its target is below entry and its
    // stop above — the opposite of a long, and the thing most likely to be
    // inverted by a refactor.
    expect(resolveAbsolutePrice("5", "POINTS", 100, "short", "sl")).toBeCloseTo(105, 10);
    expect(resolveAbsolutePrice("5", "POINTS", 100, "short", "target")).toBeCloseTo(95, 10);
  });

  it("reads PERCENTAGE against the entry price", () => {
    expect(resolveAbsolutePrice("2", "PERCENTAGE", 200, "long", "sl")).toBeCloseTo(196, 10);
    expect(resolveAbsolutePrice("2", "PERCENTAGE", 200, "long", "target")).toBeCloseTo(204, 10);
    expect(resolveAbsolutePrice("2", "PERCENTAGE", 200, "short", "sl")).toBeCloseTo(204, 10);
    expect(resolveAbsolutePrice("2", "PERCENTAGE", 200, "short", "target")).toBeCloseTo(196, 10);
  });

  it("keeps a stop on the losing side of entry for both directions", () => {
    for (const type of ["POINTS", "PERCENTAGE"] as const) {
      expect(resolveAbsolutePrice("3", type, 100, "long", "sl")).toBeLessThan(100);
      expect(resolveAbsolutePrice("3", type, 100, "short", "sl")).toBeGreaterThan(100);
    }
  });
});
