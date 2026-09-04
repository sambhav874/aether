import type { ParsedMessage, SignalAction } from "@/lib/webhooks/parse-signal-message";
import type { DispatchableSignal } from "@/lib/strategies/execute";

// For compound actions (CLOSE<side><action>) this is the side being closed,
// matching the CLOSELONG/CLOSESHORT convention the name is built from — the
// resulting new position's side is the opposite, derived separately in
// execute.ts from the action's own BUY/SELL suffix.
const ACTION_SIDE: Partial<Record<SignalAction, "long" | "short">> = {
  BUY: "long",
  SELL: "short",
  CLOSELONG: "long",
  CLOSESHORT: "short",
  CLOSELONGPARTIAL: "long",
  CLOSESHORTPARTIAL: "short",
  CLOSELONGSELL: "long",
  CLOSELONGBUY: "long",
  CLOSESHORTBUY: "short",
  CLOSESHORTSELL: "short",
};

export function deriveSide(action: SignalAction, fields: Record<string, string>): "long" | "short" {
  return ACTION_SIDE[action] ?? (fields.side ? (fields.side.toLowerCase() as "long" | "short") : "long");
}

export function buildDispatchableSignal(parsed: ParsedMessage, symbol: string, signalId: string): DispatchableSignal {
  const side = deriveSide(parsed.action, parsed.fields);
  return {
    signalId,
    action: parsed.action,
    symbol,
    tag: parsed.fields.tag ?? null,
    quantity: parsed.fields.quantity ?? null,
    risk: parsed.fields.risk ?? null,
    side,
    sl: parsed.fields.stoploss ?? null,
    target: parsed.fields.target ?? null,
    valueType: parsed.fields.type ? (parsed.fields.type.toUpperCase() as "PRICE" | "POINTS" | "PERCENTAGE") : null,
    percent: parsed.fields.percent ?? null,
    price: parsed.fields.price ?? null,
    comment: parsed.fields.comment ?? null,
    basketId: parsed.fields.basketid ?? null,
    basketName: parsed.fields.basketname ?? null,
    paper: parsed.fields.paper ?? null,
  };
}
