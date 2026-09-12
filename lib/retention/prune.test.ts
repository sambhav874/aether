import { describe, expect, it } from "vitest";
import { PRUNED_PLACEHOLDER, RETENTION, daysAgo } from "@/lib/retention/prune";

describe("retention windows", () => {
  it("keeps raw webhook bodies for the shortest time", () => {
    // The body is debugging material and the likeliest thing to carry data a
    // user later asks to have removed — it should not outlive the trade.
    expect(RETENTION.rawPayloadDays).toBeLessThan(RETENTION.rejectedSignalDays);
    expect(RETENTION.rejectedSignalDays).toBeLessThan(RETENTION.auditLogDays);
  });

  it("keeps audit entries for years, not months", () => {
    expect(RETENTION.auditLogDays).toBeGreaterThanOrEqual(365);
  });
});

describe("daysAgo", () => {
  it("counts back from now", () => {
    const now = Date.UTC(2026, 8, 13);
    expect(daysAgo(30, now).toISOString()).toBe("2026-08-14T00:00:00.000Z");
  });

  it("is exact across a month boundary", () => {
    const now = Date.UTC(2026, 2, 1);
    expect(daysAgo(1, now).toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });
});

describe("prune placeholder", () => {
  it("is a marker the re-run can recognize, so pruning is idempotent", () => {
    // The update excludes rows already carrying it; without that every run
    // would rewrite every historical row forever.
    expect(PRUNED_PLACEHOLDER).toBe("[pruned]");
  });
});
