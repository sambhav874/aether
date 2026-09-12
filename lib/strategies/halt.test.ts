import { afterEach, describe, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => ({ value: [] as { workspaceId: string | null; reason: string }[] }));
vi.mock("@/db/client", () => ({
  db: { select: () => ({ from: () => ({ where: async () => rows.value }) }) },
}));

const { checkTradingHalt, haltMessage } = await import("@/lib/strategies/halt");

afterEach(() => {
  rows.value = [];
});

describe("checkTradingHalt", () => {
  it("allows dispatch when nothing is halted", async () => {
    expect(await checkTradingHalt("ws-1")).toEqual({ halted: false });
  });

  it("halts on this workspace's own halt", async () => {
    rows.value = [{ workspaceId: "ws-1", reason: "bad signal source" }];
    expect(await checkTradingHalt("ws-1")).toEqual({
      halted: true,
      scope: "workspace",
      reason: "bad signal source",
    });
  });

  it("treats a null workspace as a platform-wide halt", async () => {
    rows.value = [{ workspaceId: null, reason: "broker outage" }];
    expect(await checkTradingHalt("ws-1")).toEqual({
      halted: true,
      scope: "platform",
      reason: "broker outage",
    });
  });

  it("reports the platform halt when both are active", async () => {
    // Which one is reported matters: "the platform is down" and "your
    // workspace is paused" call for different responses from whoever reads
    // the signal row.
    rows.value = [
      { workspaceId: "ws-1", reason: "workspace paused" },
      { workspaceId: null, reason: "platform incident" },
    ];
    const state = await checkTradingHalt("ws-1");
    expect(state).toMatchObject({ halted: true, scope: "platform", reason: "platform incident" });
  });
});

describe("haltMessage", () => {
  it("names the scope so the reason is not read out of context", () => {
    expect(haltMessage({ halted: true, scope: "platform", reason: "broker outage" })).toBe(
      "Trading is halted platform-wide — broker outage",
    );
    expect(haltMessage({ halted: true, scope: "workspace", reason: "manual stop" })).toBe(
      "Trading is halted for this workspace — manual stop",
    );
  });
});
