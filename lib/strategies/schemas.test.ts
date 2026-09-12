import { describe, expect, it } from "vitest";
import {
  exitRulesSchema,
  haltReasonSchema,
  maxTriggersSchema,
  parseInput,
  riskSettingsSchema,
} from "@/lib/strategies/schemas";

describe("riskSettingsSchema", () => {
  it("accepts a realistic settings payload", () => {
    const result = parseInput(riskSettingsSchema, {
      sizingMethod: "FIXED_PERCENTAGE",
      maxRiskPct: 1.5,
      dailyTradeLimit: 10,
      allowMultipleSameSide: false,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a negative capital", () => {
    // These values reach position sizing, so a negative is not a typo to
    // tolerate — it is an order size.
    expect(parseInput(riskSettingsSchema, { totalCapital: -5000 }).ok).toBe(false);
  });

  it("rejects NaN and Infinity", () => {
    expect(parseInput(riskSettingsSchema, { maxRiskPct: Number.NaN }).ok).toBe(false);
    expect(parseInput(riskSettingsSchema, { totalCapital: Number.POSITIVE_INFINITY }).ok).toBe(false);
  });

  it("rejects a fractional position count", () => {
    expect(parseInput(riskSettingsSchema, { maxConcurrentPositions: 2.5 }).ok).toBe(false);
  });

  it("rejects an unknown sizing method", () => {
    expect(parseInput(riskSettingsSchema, { sizingMethod: "MARTINGALE" }).ok).toBe(false);
  });

  it("allows null to mean 'no limit'", () => {
    const result = parseInput(riskSettingsSchema, { maxConcurrentPositions: null, maxRiskPct: null });
    expect(result.ok).toBe(true);
  });

  it("names the offending field in the message", () => {
    const result = parseInput(riskSettingsSchema, { totalCapital: -1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("totalCapital");
  });
});

describe("exitRulesSchema", () => {
  it("accepts well-formed rules", () => {
    const result = parseInput(exitRulesSchema, {
      trailingRules: [{ rrLevel: 1, trailingType: "ATR", sortOrder: 0 }],
      partialRules: [{ rrLevel: 1, exitPct: 50, sortOrder: 0 }],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an exit percentage above 100", () => {
    expect(
      parseInput(exitRulesSchema, {
        trailingRules: [],
        partialRules: [{ rrLevel: 1, exitPct: 150, sortOrder: 0 }],
      }).ok,
    ).toBe(false);
  });

  it("rejects a non-positive R:R level", () => {
    expect(
      parseInput(exitRulesSchema, {
        trailingRules: [{ rrLevel: 0, trailingType: "EMA", sortOrder: 0 }],
        partialRules: [],
      }).ok,
    ).toBe(false);
  });

  it("caps the rule count — an unbounded list is its own denial of service", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ rrLevel: 1, exitPct: 1, sortOrder: i }));
    expect(parseInput(exitRulesSchema, { trailingRules: [], partialRules: many }).ok).toBe(false);
  });

  it("rejects an unknown trailing type", () => {
    expect(
      parseInput(exitRulesSchema, {
        trailingRules: [{ rrLevel: 1, trailingType: "FIBONACCI", sortOrder: 0 }],
        partialRules: [],
      }).ok,
    ).toBe(false);
  });
});

describe("maxTriggersSchema", () => {
  it("accepts a positive whole number or null", () => {
    expect(parseInput(maxTriggersSchema, 25).ok).toBe(true);
    expect(parseInput(maxTriggersSchema, null).ok).toBe(true);
  });

  it("rejects zero, negatives and fractions", () => {
    for (const value of [0, -1, 2.5]) {
      expect(parseInput(maxTriggersSchema, value).ok).toBe(false);
    }
  });
});

describe("haltReasonSchema", () => {
  it("requires something to read back later", () => {
    expect(parseInput(haltReasonSchema, "   ").ok).toBe(false);
    expect(parseInput(haltReasonSchema, "").ok).toBe(false);
  });

  it("trims and accepts a real reason", () => {
    const result = parseInput(haltReasonSchema, "  bad TradingView alert  ");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe("bad TradingView alert");
  });

  it("bounds the length", () => {
    expect(parseInput(haltReasonSchema, "x".repeat(5000)).ok).toBe(false);
  });
});
