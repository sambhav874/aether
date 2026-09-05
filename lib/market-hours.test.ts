import { describe, expect, it } from "vitest";
import { istDayStartUtc } from "@/lib/market-hours";

describe("istDayStartUtc", () => {
  it("returns 18:30 UTC the previous day, which is IST midnight", () => {
    // 06 Sep 2026 10:00 UTC = 15:30 IST, mid-session.
    const start = istDayStartUtc(new Date("2026-09-06T10:00:00Z"));
    expect(start.toISOString()).toBe("2026-09-05T18:30:00.000Z");
  });

  it("keeps the whole NSE session inside one window", () => {
    // The bug this replaces: a UTC-midnight boundary rolls at 05:30 IST, so
    // an order at 09:15 IST and one at 15:30 IST counted as different days.
    const open = new Date("2026-09-06T03:45:00Z"); // 09:15 IST
    const close = new Date("2026-09-06T10:00:00Z"); // 15:30 IST
    expect(istDayStartUtc(open).toISOString()).toBe(istDayStartUtc(close).toISOString());
  });

  it("rolls at IST midnight, not UTC midnight", () => {
    const beforeIstMidnight = new Date("2026-09-06T18:29:00Z"); // 23:59 IST
    const afterIstMidnight = new Date("2026-09-06T18:31:00Z"); // 00:01 IST next day
    expect(istDayStartUtc(beforeIstMidnight).toISOString()).toBe("2026-09-05T18:30:00.000Z");
    expect(istDayStartUtc(afterIstMidnight).toISOString()).toBe("2026-09-06T18:30:00.000Z");
  });

  it("does not roll at UTC midnight", () => {
    const justBeforeUtcMidnight = new Date("2026-09-06T23:59:00Z");
    const justAfterUtcMidnight = new Date("2026-09-07T00:01:00Z");
    expect(istDayStartUtc(justBeforeUtcMidnight).toISOString()).toBe(
      istDayStartUtc(justAfterUtcMidnight).toISOString(),
    );
  });
});
