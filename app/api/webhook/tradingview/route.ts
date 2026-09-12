import { NextResponse, after, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { strategies, signals } from "@/db/schema/strategies";
import { parseSignalMessage, redactSecret, secretMatches } from "@/lib/webhooks/parse-signal-message";
import { extractMessage, requiredFields } from "@/lib/webhooks/http";
import { deriveSide, buildDispatchableSignal } from "@/lib/webhooks/build-signal";
import { dispatchSignal } from "@/lib/strategies/execute";
import { checkStrategyRateLimit } from "@/lib/strategies/rate-limits";
import { notifyWorkspace } from "@/lib/telegram/notify";
import { createStageTimer, emit } from "@/lib/observability/trace";

// The 202 is immediate, but after() keeps running — the function must stay
// alive for it, and that background work includes the whole per-account
// fan-out. Same truncation risk as the sync route; see the note there.
export const maxDuration = 300;

/**
 * TradingView-specific webhook: unlike /api/webhook/strategy/signal, this
 * acks 202 immediately and does everything else — parsing, strategy lookup,
 * dispatch — in the background via `after()`. Validation errors never reach
 * the caller here; they're logged server-side only. This exists because
 * TradingView's own alert delivery has no retry-on-4xx behavior worth
 * relying on, and the documented contract (Notion "Webhook Strategy Guide")
 * is explicit that this endpoint never talks back about what went wrong.
 */
export async function POST(request: NextRequest) {
  // Timed from request entry, not from inside after() — the queued work is
  // part of the order's latency even though the 202 already went out.
  const timer = createStageTimer();
  const messageResult = await extractMessage(request);
  const rawBody = typeof messageResult === "string" ? messageResult : "";
  // Both the signals row and the console logs below use this, never rawBody —
  // the webhook secret must not be readable from either.
  const storedBody = redactSecret(rawBody);

  after(async () => {
    try {
      if (typeof messageResult !== "string") {
        console.error("[webhook/tradingview] rejected — %s", messageResult.error);
        return;
      }

      const parsed = parseSignalMessage(messageResult);
      timer.mark("parsed");
      if ("error" in parsed) {
        console.error("[webhook/tradingview] parse error — %s | raw: %s", parsed.error, storedBody);
        return;
      }

      const strategy = await db.query.strategies.findFirst({ where: eq(strategies.slug, parsed.slug) });
      timer.mark("strategy_loaded");
      if (!strategy || strategy.status === "paused") {
        if (strategy) {
          await db.insert(signals).values({
            id: crypto.randomUUID(),
            strategyId: strategy.id,
            source: "tradingview",
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
        console.error("[webhook/tradingview] unknown or paused slug — %s", parsed.slug);
        return;
      }

      if (!secretMatches(strategy.webhookSecret, parsed.secret)) {
        await db.insert(signals).values({
          id: crypto.randomUUID(),
          strategyId: strategy.id,
          source: "tradingview",
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
        console.error("[webhook/tradingview] invalid webhook secret — slug %s", parsed.slug);
        return;
      }

      const rateLimit = await checkStrategyRateLimit(strategy.id, strategy.coolDownPeriod, strategy.maxTriggersPerDay);
      timer.mark("rate_limited");
      if (!rateLimit.ok) {
        await db.insert(signals).values({
          id: crypto.randomUUID(),
          strategyId: strategy.id,
          source: "tradingview",
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
        console.error("[webhook/tradingview] rate limited — %s", rateLimit.reason);
        return;
      }

      const symbol = parsed.symbol ?? strategy.defaultSymbol;
      if (!symbol) {
        console.error("[webhook/tradingview] missing symbol, no default configured — slug %s", parsed.slug);
        return;
      }

      const fieldError = requiredFields(parsed.action, strategy.market, parsed.fields);
      if (fieldError) {
        console.error("[webhook/tradingview] field validation error — %s | raw: %s", fieldError.error, storedBody);
        return;
      }

      const signalId = crypto.randomUUID();
      const signal = buildDispatchableSignal(parsed, symbol, signalId);

      await db.insert(signals).values({
        id: signalId,
        strategyId: strategy.id,
        source: "tradingview",
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
      timer.mark("persisted");

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

      timer.mark("dispatched");

      await db
        .update(signals)
        .set({ status: outcome.status, resultMessage: outcome.resultMessage })
        .where(eq(signals.id, signalId));

      emit("signal.complete", {
        signalId,
        strategyId: strategy.id,
        slug: parsed.slug,
        source: "tradingview",
        action: parsed.action,
        symbol,
        status: outcome.status,
        resultMessage: outcome.resultMessage,
        totalMs: timer.totalMs(),
        stages: timer.stages(),
      });

      const emoji = outcome.status === "rejected" ? "⛔" : outcome.status === "pending_confirmation" ? "⏳" : "✅";
      void notifyWorkspace(
        strategy.workspaceId,
        "signalAlerts",
        `${emoji} ${strategy.name}: ${parsed.action} ${symbol} — ${outcome.resultMessage}`,
      );

      if (outcome.status === "rejected") {
        console.error("[webhook/tradingview] dispatch rejected — %s", outcome.resultMessage);
      }
    } catch (error) {
      console.error("[webhook/tradingview] unhandled error —", error);
    }
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}
