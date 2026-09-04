import { describe, it, expect } from "vitest";
import { extractNumbers, extractEvidenceNumbers, isWithinTolerance, checkNumericFidelity } from "./numeric-fidelity";

describe("extractNumbers", () => {
  it("extracts plain integers and decimals, including negatives", () => {
    const values = extractNumbers("PE is 28.4, RSI is 62, change is -3.5").map((n) => n.value);
    expect(values).toEqual([28.4, 62, -3.5]);
  });

  it("strips currency symbols", () => {
    const values = extractNumbers("Price is ₹1234.5, target is $99.99").map((n) => n.value);
    expect(values).toEqual([1234.5, 99.99]);
  });

  it("handles both international and Indian comma grouping", () => {
    const values = extractNumbers("Market cap is 1,234,567 (international) or 12,34,56,789 (Indian grouping)").map((n) => n.value);
    expect(values[0]).toBe(1_234_567);
    expect(values[1]).toBe(123_456_789);
  });

  it("applies scale suffixes (K/L/Cr/M/B/T), case-insensitively", () => {
    const map: Record<string, number> = Object.fromEntries(extractNumbers("5K, 1.2L, 3.4Cr, 2M, 1.5B, 1T, 2cr, 3l").map((n) => [n.raw, n.value]));
    expect(map["5K"]).toBe(5_000);
    expect(map["1.2L"]).toBeCloseTo(120_000, 6);
    expect(map["3.4Cr"]).toBeCloseTo(34_000_000, 6);
    expect(map["2M"]).toBe(2_000_000);
    expect(map["1.5B"]).toBe(1_500_000_000);
    expect(map["1T"]).toBe(1_000_000_000_000);
    expect(map["2cr"]).toBe(20_000_000);
    expect(map["3l"]).toBe(300_000);
  });

  it("treats a trailing % as the value itself, not multiplied", () => {
    const values = extractNumbers("Up 12.3% today").map((n) => n.value);
    expect(values).toEqual([12.3]);
  });

  it("excludes ISO dates entirely, including their component digit groups", () => {
    const values = extractNumbers("As of 2026-08-13, PE is 28.4").map((n) => n.value);
    expect(values).toEqual([28.4]);
  });

  it("excludes bare 4-digit numbers that read as years, but keeps decorated ones", () => {
    const values = extractNumbers("In 2026 the stock returned 2026.5%, and volume was 2026 shares").map((n) => n.value);
    // "2026" (bare, integer, no %) excluded twice; "2026.5%" kept (has a decimal + %, not bare)
    expect(values).toEqual([2026.5]);
  });
});

describe("extractEvidenceNumbers", () => {
  it("walks nested objects and arrays for numeric leaves", () => {
    const evidence = { symbol: "TCS", sections: { valuation: { peRatioTrailing: 28.4, marketCap: 1_500_000 } }, rows: [{ pe: 20 }, { pe: 25.5 }] };
    const numbers = extractEvidenceNumbers(evidence).sort((a, b) => a - b);
    expect(numbers).toEqual([20, 25.5, 28.4, 1_500_000]);
  });

  it("counts numeric-looking strings (e.g. serialized decimal columns) as evidence", () => {
    const numbers = extractEvidenceNumbers({ costUsd: "0.000420", label: "not-a-number" });
    expect(numbers).toEqual([0.00042]);
  });

  it("ignores NaN/Infinity and non-numeric strings", () => {
    const numbers = extractEvidenceNumbers({ a: Number.NaN, b: Number.POSITIVE_INFINITY, c: "hello", d: 5 });
    expect(numbers).toEqual([5]);
  });
});

describe("isWithinTolerance", () => {
  it("accepts rounding a decimal to the nearest integer via the absolute floor", () => {
    expect(isWithinTolerance(28, 28.4)).toBe(true);
  });

  it("accepts a 1% relative rounding on a large number", () => {
    expect(isWithinTolerance(1_010_000, 1_000_000)).toBe(true);
  });

  it("rejects a claim well outside tolerance", () => {
    expect(isWithinTolerance(50, 28.4)).toBe(false);
  });
});

describe("checkNumericFidelity", () => {
  const evidence = { report: { peRatioTrailing: 28.4, dividendYield: 2.1 }, quote: { last: 3850.5 } };

  it("passes when every claimed number is grounded in evidence", () => {
    const result = checkNumericFidelity("TCS trades at a PE of 28.4 with a 2.1% dividend yield, last price ₹3850.5.", evidence);
    expect(result.ok).toBe(true);
    expect(result.matched).toBe(result.total);
  });

  it("fails and reports the offending value when a number isn't grounded", () => {
    const result = checkNumericFidelity("TCS trades at a PE of 45.2, which looks expensive.", evidence);
    expect(result.ok).toBe(false);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].value).toBe(45.2);
    expect(result.unmatched[0].nearestEvidence).toBe(28.4);
  });

  it("trivially passes an answer with no numeric claims at all", () => {
    const result = checkNumericFidelity("TCS looks fundamentally strong relative to its sector peers.", evidence);
    expect(result.ok).toBe(true);
    expect(result.total).toBe(0);
  });

  it("does not fail on a bare year even with no matching evidence", () => {
    const result = checkNumericFidelity("Looking ahead to 2027, guidance was reaffirmed.", evidence);
    expect(result.ok).toBe(true);
  });
});
