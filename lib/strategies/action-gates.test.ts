import { describe, it, expect } from "vitest";
import { gateAction, type StrategyActionFlags } from "@/lib/strategies/action-gates";

const ALL_ON: StrategyActionFlags = { allowEntry: true, allowExit: true, allowModify: true };

describe("gateAction", () => {
  it("allows every action when all three toggles are on", () => {
    const actions = [
      "BUY",
      "SELL",
      "CLOSELONG",
      "CLOSESHORT",
      "CLOSELONGPARTIAL",
      "CLOSESHORTPARTIAL",
      "MODIFY",
      "CLOSESHORTBUY",
      "CLOSELONGSELL",
      "CLOSESHORTSELL",
      "CLOSELONGBUY",
    ] as const;
    for (const action of actions) {
      expect(gateAction(action, ALL_ON)).toEqual({ kind: "allow" });
    }
  });

  it("blocks entries when Entry is off, leaving exits and modifies alone", () => {
    const flags = { ...ALL_ON, allowEntry: false };
    expect(gateAction("BUY", flags).kind).toBe("block");
    expect(gateAction("SELL", flags).kind).toBe("block");
    expect(gateAction("CLOSELONG", flags).kind).toBe("allow");
    expect(gateAction("MODIFY", flags).kind).toBe("allow");
  });

  it("blocks every close variant when Exit is off", () => {
    const flags = { ...ALL_ON, allowExit: false };
    expect(gateAction("CLOSELONG", flags).kind).toBe("block");
    expect(gateAction("CLOSESHORT", flags).kind).toBe("block");
    expect(gateAction("CLOSELONGPARTIAL", flags).kind).toBe("block");
    expect(gateAction("CLOSESHORTPARTIAL", flags).kind).toBe("block");
    expect(gateAction("BUY", flags).kind).toBe("allow");
  });

  it("blocks MODIFY only when SL/Target is off", () => {
    expect(gateAction("MODIFY", { ...ALL_ON, allowModify: false }).kind).toBe("block");
    expect(gateAction("MODIFY", { ...ALL_ON, allowEntry: false, allowExit: false }).kind).toBe("allow");
  });

  it("names the disabled toggle and the action in the reason", () => {
    const gate = gateAction("BUY", { ...ALL_ON, allowEntry: false });
    expect(gate).toMatchObject({ kind: "block", reason: "Entry is disabled on this strategy — BUY cancelled" });
  });

  it("runs the close leg only when Entry is off on a compound action", () => {
    const gate = gateAction("CLOSESHORTBUY", { ...ALL_ON, allowEntry: false });
    expect(gate).toMatchObject({ kind: "legs", closeLeg: true, openLeg: false });
  });

  it("runs the open leg only when Exit is off on a compound action", () => {
    const gate = gateAction("CLOSELONGSELL", { ...ALL_ON, allowExit: false });
    expect(gate).toMatchObject({ kind: "legs", closeLeg: false, openLeg: true });
  });

  it("blocks a compound action outright when both legs are disabled", () => {
    const gate = gateAction("CLOSELONGBUY", { allowEntry: false, allowExit: false, allowModify: true });
    expect(gate.kind).toBe("block");
  });
});
