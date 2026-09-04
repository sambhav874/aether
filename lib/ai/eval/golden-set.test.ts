import { describe, it, expect } from "vitest";
import { GOLDEN_SET, GOLDEN_SET_CATEGORIES } from "./golden-set";

describe("GOLDEN_SET", () => {
  it("has unique ids", () => {
    const ids = GOLDEN_SET.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry has a non-empty query and notes", () => {
    for (const entry of GOLDEN_SET) {
      expect(entry.query.trim().length).toBeGreaterThan(0);
      expect(entry.notes.trim().length).toBeGreaterThan(0);
    }
  });

  it("every entry's category is one of the declared categories", () => {
    for (const entry of GOLDEN_SET) {
      expect(GOLDEN_SET_CATEGORIES).toContain(entry.category);
    }
  });

  it("should_refuse entries expect zero tool calls", () => {
    const refusals = GOLDEN_SET.filter((e) => e.category === "should_refuse");
    expect(refusals.length).toBeGreaterThan(0);
    for (const entry of refusals) {
      expect(entry.expectedTools).toEqual([]);
    }
  });

  it("covers every declared category at least once", () => {
    const covered = new Set(GOLDEN_SET.map((e) => e.category));
    for (const category of GOLDEN_SET_CATEGORIES) {
      expect(covered.has(category)).toBe(true);
    }
  });
});
