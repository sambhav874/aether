import { describe, it, expect } from "vitest";
import { stalePositionIds, RECONCILE_GRACE_MS, type ReconcilableRow } from "@/lib/runners/reconcile";

const NOW = new Date("2026-09-05T12:00:00Z");
const OLD = new Date(NOW.getTime() - 60 * 60 * 1000);

function row(overrides: Partial<ReconcilableRow> = {}): ReconcilableRow {
  return { id: "pos_1", externalPositionId: "ext_1", isPaper: false, openedAt: OLD, ...overrides };
}

describe("stalePositionIds", () => {
  it("closes a settled row the broker no longer reports", () => {
    expect(stalePositionIds([row()], [], NOW)).toEqual(["pos_1"]);
  });

  it("keeps a row the broker still reports", () => {
    expect(stalePositionIds([row()], ["ext_1"], NOW)).toEqual([]);
  });

  it("never closes a paper position — it exists at no broker", () => {
    expect(stalePositionIds([row({ isPaper: true })], [], NOW)).toEqual([]);
  });

  it("never closes a row with no external id, whose absence proves nothing", () => {
    expect(stalePositionIds([row({ externalPositionId: null })], [], NOW)).toEqual([]);
  });

  it("leaves a just-opened row alone until the feed can catch up", () => {
    const fresh = row({ openedAt: new Date(NOW.getTime() - 30 * 1000) });
    expect(stalePositionIds([fresh], [], NOW)).toEqual([]);
  });

  it("reconciles once the grace period has elapsed", () => {
    const justPast = row({ openedAt: new Date(NOW.getTime() - RECONCILE_GRACE_MS - 1000) });
    expect(stalePositionIds([justPast], [], NOW)).toEqual(["pos_1"]);
  });

  it("closes only the rows that are actually missing", () => {
    const rows = [
      row({ id: "a", externalPositionId: "ext_a" }),
      row({ id: "b", externalPositionId: "ext_b" }),
      row({ id: "c", externalPositionId: "ext_c" }),
    ];
    expect(stalePositionIds(rows, ["ext_b"], NOW)).toEqual(["a", "c"]);
  });
});
