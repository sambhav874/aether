import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { strategies, signals } from "@/db/schema/strategies";
import { parseSignalMessage, redactSecret, secretMatches } from "@/lib/webhooks/parse-signal-message";
import { extractMessage, requiredFields } from "@/lib/webhooks/http";
import { deriveSide, buildDispatchableSignal } from "@/lib/webhooks/build-signal";
import { dispatchSignal } from "@/lib/strategies/execute";
import { checkStrategyRateLimit } from "@/lib/strategies/rate-limits";
import { notifyWorkspace } from "@/lib/telegram/notify";

// Identical for every "the slug can't be used" reason (unknown, disabled) so
// an unauthenticated caller can't probe for which slugs exist.
const INVALID_WEBHOOK_MESSAGE = "Invalid webhook request";

// Dispatch fans out to every linked broker account before this replies.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const messageResult = await extractMessage(request);
  if (typeof messageResult !== "string") {
    return NextResponse.json({ error: messageResult.error }, { status: 400 });
  }
  const rawBody = messageResult;
  // Everything persisted on the signals row goes through this, never rawBody
  // itself — see redactSecret's note on why the secret can't live in the log.
  const storedBody = redactSecret(rawBody);

  const parsed = parseSignalMessage(messageResult);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const strategy = await db.query.strategies.findFirst({ where: eq(strategies.slug, parsed.slug) });
  if (!strategy || strategy.status === "paused") {
    if (strategy) {
      // Still logged for the owner's own signal history — the uniform 404
      // is about what an unauthenticated caller can observe, not about
      // hiding activity from the dashboard.
      await db.insert(signals).values({
        id: crypto.randomUUID(),
        strategyId: strategy.id,
        source: "webhook",
        action: parsed.action,
        side: deriveSide(parsed.action, parsed.fields),
        symbol: parsed.symbol ?? strategy.defaultSymbol ?? "unknown",
        market: strategy.market,
        tag: parsed.fields.tag ?? null,
        status: "rejected",
        resultMessage: "strategy is paused",
        rawPayload: storedBody,
      });
    }
    return NextResponse.json({ error: INVALID_WEBHOOK_MESSAGE }, { status: 404 });
  }

  // Same uniform 404 as an unknown slug: a wrong secret must not tell the
  // caller that the slug itself was right.
  if (strategy.webhookSecret && !secretMatches(strategy.webhookSecret, parsed.secret)) {
    await db.insert(signals).values({
      id: crypto.randomUUID(),
      strategyId: strategy.id,
      source: "webhook",
      action: parsed.action,
      side: deriveSide(parsed.action, parsed.fields),
      symbol: parsed.symbol ?? strategy.defaultSymbol ?? "unknown",
      market: strategy.market,
      tag: parsed.fields.tag ?? null,
      status: "rejected",
      resultMessage: "invalid or missing webhook secret",
      rawPayload: storedBody,
    });
    void notifyWorkspace(strategy.workspaceId, "signalAlerts", `⛔ ${strategy.name}: invalid webhook secret`);
    return NextResponse.json({ error: INVALID_WEBHOOK_MESSAGE }, { status: 404 });
  }

  const rateLimit = await checkStrategyRateLimit(strategy.id, strategy.coolDownPeriod, strategy.maxTriggersPerDay);
  if (!rateLimit.ok) {
    await db.insert(signals).values({
      id: crypto.randomUUID(),
      strategyId: strategy.id,
      source: "webhook",
      action: parsed.action,
      side: deriveSide(parsed.action, parsed.fields),
      symbol: parsed.symbol ?? strategy.defaultSymbol ?? "unknown",
      market: strategy.market,
      tag: parsed.fields.tag ?? null,
      status: "rejected",
      resultMessage: rateLimit.reason,
      rawPayload: storedBody,
    });
    void notifyWorkspace(strategy.workspaceId, "signalAlerts", `⛔ ${strategy.name}: ${rateLimit.reason}`);
    return NextResponse.json({ error: rateLimit.reason }, { status: 429 });
  }

  const symbol = parsed.symbol ?? strategy.defaultSymbol;
  if (!symbol) {
    return NextResponse.json({ error: "missing symbol (no default configured on this strategy)" }, { status: 400 });
  }

  const fieldError = requiredFields(parsed.action, strategy.market, parsed.fields);
  if (fieldError) {
    return NextResponse.json({ error: fieldError.error }, { status: 400 });
  }

  // Inserted before dispatch (not after) so a queued limit order can update
  // this same row later once it actually fills or expires — see
  // lib/strategies/execute.ts's pendingLimitOrders path.
  const signalId = crypto.randomUUID();
  const signal = buildDispatchableSignal(parsed, symbol, signalId);

  await db.insert(signals).values({
    id: signalId,
    strategyId: strategy.id,
    source: "webhook",
    action: parsed.action,
    side: signal.side,
    symbol,
    market: strategy.market,
    price: signal.price,
    sl: signal.sl,
    target: signal.target,
    valueType: signal.valueType,
    tag: signal.tag,
    quantity: signal.quantity,
    status: "received",
    parsedFields: parsed.fields,
    rawPayload: storedBody,
  });

  const pendingConfirmation = strategy.handleType === "MANUAL";
  const outcome = pendingConfirmation
    ? { status: "pending_confirmation" as const, resultMessage: "awaiting manual confirmation" }
    : await dispatchSignal(
        {
          id: strategy.id,
          workspaceId: strategy.workspaceId,
          market: strategy.market,
          handleType: strategy.handleType,
          createdBy: strategy.createdBy,
          paperTrading: strategy.paperTrading,
          allowEntry: strategy.allowEntry,
          allowExit: strategy.allowExit,
          allowModify: strategy.allowModify,
        },
        signal,
      );

  await db
    .update(signals)
    .set({ status: outcome.status, resultMessage: outcome.resultMessage })
    .where(eq(signals.id, signalId));

  const emoji = outcome.status === "rejected" ? "⛔" : outcome.status === "pending_confirmation" ? "⏳" : "✅";
  void notifyWorkspace(
    strategy.workspaceId,
    "signalAlerts",
    `${emoji} ${strategy.name}: ${parsed.action} ${symbol} — ${outcome.resultMessage}`,
  );

  return NextResponse.json({ ok: true, signalId, status: outcome.status });
}
