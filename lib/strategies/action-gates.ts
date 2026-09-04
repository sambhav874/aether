import type { SignalAction } from "@/lib/webhooks/parse-signal-message";

/**
 * The three per-strategy kill switches (strategies.allow_entry / allow_exit /
 * allow_modify). Mirrors the reference product's Entry / Exit / SL-Target
 * toggles: a signal whose action falls under a disabled toggle is cancelled
 * with a reason rather than silently dropped.
 *
 * This only gates *signals*. Stop-loss/target hits, trailing stops and
 * manual closes from the Positions UI run through their own paths and are
 * never gated here — matching the toggles' own copy in the UI.
 */
export type StrategyActionFlags = {
  allowEntry: boolean;
  allowExit: boolean;
  allowModify: boolean;
};

export type ActionGate =
  | { kind: "allow" }
  | { kind: "block"; reason: string }
  /**
   * Compound close+open actions (CLOSE<side><BUY|SELL>) are gated per leg,
   * not as a unit: with Entry off the close still runs (the trader stopped
   * new positions, not exits), and with Exit off the open still runs. Only
   * when both toggles are off does the whole signal become a "block".
   */
  | { kind: "legs"; closeLeg: boolean; openLeg: boolean; note: string };

const ENTRY_ACTIONS = new Set<SignalAction>(["BUY", "SELL"]);

const EXIT_ACTIONS = new Set<SignalAction>([
  "CLOSELONG",
  "CLOSESHORT",
  "CLOSELONGPARTIAL",
  "CLOSESHORTPARTIAL",
]);

const COMPOUND_ACTIONS = new Set<SignalAction>([
  "CLOSESHORTBUY",
  "CLOSELONGSELL",
  "CLOSESHORTSELL",
  "CLOSELONGBUY",
]);

const ENTRY_OFF = "Entry is disabled on this strategy";
const EXIT_OFF = "Exit is disabled on this strategy";
const MODIFY_OFF = "SL / Target is disabled on this strategy";

export function gateAction(action: SignalAction, flags: StrategyActionFlags): ActionGate {
  if (ENTRY_ACTIONS.has(action)) {
    return flags.allowEntry ? { kind: "allow" } : { kind: "block", reason: `${ENTRY_OFF} — ${action} cancelled` };
  }

  if (EXIT_ACTIONS.has(action)) {
    return flags.allowExit ? { kind: "allow" } : { kind: "block", reason: `${EXIT_OFF} — ${action} cancelled` };
  }

  if (action === "MODIFY") {
    return flags.allowModify ? { kind: "allow" } : { kind: "block", reason: `${MODIFY_OFF} — MODIFY cancelled` };
  }

  if (COMPOUND_ACTIONS.has(action)) {
    if (!flags.allowExit && !flags.allowEntry) {
      return { kind: "block", reason: `${ENTRY_OFF} and ${EXIT_OFF} — ${action} cancelled` };
    }
    if (!flags.allowEntry) {
      return { kind: "legs", closeLeg: true, openLeg: false, note: `${ENTRY_OFF} — open leg skipped` };
    }
    if (!flags.allowExit) {
      return { kind: "legs", closeLeg: false, openLeg: true, note: `${EXIT_OFF} — close leg skipped` };
    }
    return { kind: "allow" };
  }

  return { kind: "allow" };
}
