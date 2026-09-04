import type { NextRequest } from "next/server";
import type { Market } from "@/db/schema";
import type { SignalAction } from "@/lib/webhooks/parse-signal-message";

export async function extractMessage(request: NextRequest): Promise<string | { error: string }> {
  const contentType = request.headers.get("content-type") ?? "";
  const rawBody = await request.text();

  if (contentType.includes("application/json")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return { error: "body is not valid JSON" };
    }
    const message = (parsed as Record<string, unknown> | null)?.message;
    if (typeof message !== "string" || message.length === 0) {
      return { error: "missing message field" };
    }
    return message;
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawBody);
    const message = params.get("message");
    if (!message) return { error: "missing message field" };
    return message;
  }

  // Plain text (or unlabeled): the whole body is the message.
  if (!rawBody.trim()) return { error: "missing message field" };
  return rawBody;
}

const PARTIAL_CLOSE_ACTIONS = new Set<SignalAction>(["CLOSELONGPARTIAL", "CLOSESHORTPARTIAL"]);

// price= is entry-limit-only: valid on a bare BUY/SELL, and on the open leg
// of a compound close+open action (CLOSE<side><action>) — see the "Entry
// Limit Price" section of the webhook guide. execute.ts's dispatchCompound
// forwards the signal's own price= into its dispatchEntry() call, so these
// four need to pass the same intake validation a bare entry does.
const PRICE_ELIGIBLE_ACTIONS = new Set<SignalAction>([
  "BUY",
  "SELL",
  "CLOSESHORTBUY",
  "CLOSELONGSELL",
  "CLOSESHORTSELL",
  "CLOSELONGBUY",
]);

export function requiredFields(action: SignalAction, market: Market, fields: Record<string, string>) {
  if (fields.price !== undefined) {
    // price= is entry-limit-only, options-only — see lib/strategies/execute.ts
    // for why it's rejected everywhere else instead of silently ignored.
    if (!PRICE_ELIGIBLE_ACTIONS.has(action)) {
      return { error: "price= is only valid on BUY/SELL entries or the open leg of a compound action" };
    }
    if (market !== "indian_options") {
      return { error: "price= is only supported for indian_options strategies" };
    }
    if (!Number.isFinite(Number(fields.price)) || Number(fields.price) <= 0) {
      return { error: "price= must be a positive number" };
    }
  }

  if (PARTIAL_CLOSE_ACTIONS.has(action)) {
    const percent = fields.percent !== undefined ? Number(fields.percent) : null;
    const quantity = fields.quantity !== undefined ? Number(fields.quantity) : null;
    if (percent === null && quantity === null) {
      return { error: `${action} requires either percent=<1-100> or quantity=<lots>` };
    }
    if (percent !== null && (!Number.isFinite(percent) || percent <= 0 || percent > 100)) {
      return { error: "percent= must be a number in the range (0, 100]" };
    }
    if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) {
      return { error: "quantity= must be a positive number" };
    }
  }

  if (action === "MODIFY") {
    if (fields.side && fields.side.toLowerCase() !== "long" && fields.side.toLowerCase() !== "short") {
      return { error: "invalid side — must be LONG or SHORT" };
    }
    if (fields.type && !["price", "points", "percentage"].includes(fields.type.toLowerCase())) {
      return { error: "invalid type — must be PRICE, POINTS, or PERCENTAGE" };
    }
    if (!fields.stoploss && !fields.target) {
      return { error: "MODIFY requires stopLoss and/or target" };
    }
  }
  return null;
}
