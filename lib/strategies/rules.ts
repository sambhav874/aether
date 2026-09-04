import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import {
  positions,
  brokerAccounts,
  strategyPartialRules,
  strategyRuleFires,
} from "@/db/schema";
import { getRunner } from "@/lib/runners";
import { logAudit } from "@/lib/audit/log";

/**
 * Fires partial-booking rules ("at R:R level N, book X% of the position")
 * against every open, non-paper position tied to a strategy that has at
 * least one partial rule configured. Current R is derived from real broker
 * data only: `unrealizedPnl` (from `runner.getPositions()`) implies the
 * current price, and `positions.sl` is the risk distance — never a
 * fabricated number. A position with no SL set (BY_STRATEGY handle type, or
 * never modified) can't have its R computed, so it's skipped rather than
 * guessed.
 *
 * Trailing-stop rule EXECUTION is deliberately not built yet — see
 * PLAN_GROUP3.md Phase 2C. Doing it correctly needs a stored "initial risk
 * distance" (today's `sl` may already reflect a prior manual MODIFY, not
 * the original stop) and real EMA/ATR OHLC data for type-correctness;
 * shipping an approximation that moves a live stop-loss on real money isn't
 * an acceptable place to cut a corner. The schema and UI for configuring
 * trailing rules are already in place for whenever this gets picked up.
 */
export async function evaluatePartialRules(): Promise<{
  checked: number;
  fired: number;
  errors: string[];
}> {
  const candidates = await db
    .selectDistinct({
      positionId: positions.id,
      workspaceId: positions.workspaceId,
      strategyId: positions.strategyId,
      accountId: positions.accountId,
      provider: brokerAccounts.provider,
      symbol: positions.symbol,
      side: positions.side,
      entryPrice: positions.entryPrice,
      sl: positions.sl,
      quantity: positions.quantity,
      externalPositionId: positions.externalPositionId,
    })
    .from(positions)
    .innerJoin(brokerAccounts, eq(positions.accountId, brokerAccounts.id))
    .innerJoin(strategyPartialRules, eq(strategyPartialRules.strategyId, positions.strategyId))
    .where(and(eq(positions.status, "open"), eq(positions.isPaper, false)));

  let checked = 0;
  let fired = 0;
  const errors: string[] = [];

  // Group by account so each account's open positions are fetched from the
  // broker once, not once per position.
  const byAccount = new Map<string, typeof candidates>();
  for (const row of candidates) {
    const list = byAccount.get(row.accountId) ?? [];
    list.push(row);
    byAccount.set(row.accountId, list);
  }

  for (const [accountId, rows] of byAccount) {
    if (!rows[0].externalPositionId) continue;
    let brokerPositions;
    try {
      const runner = await getRunner(rows[0].provider);
      brokerPositions = await runner.getPositions(accountId);
    } catch (error) {
      errors.push(`${accountId}: ${error instanceof Error ? error.message : "unknown error"}`);
      continue;
    }

    for (const row of rows) {
      checked += 1;
      if (!row.externalPositionId || !row.sl || !row.strategyId) continue;

      const live = brokerPositions.find((p) => p.externalPositionId === row.externalPositionId);
      if (!live) continue;

      const entryPrice = Number(row.entryPrice);
      const sl = Number(row.sl);
      const openQty = Number(row.quantity);
      const riskDistance = Math.abs(entryPrice - sl);
      if (riskDistance === 0) continue;

      const currentPrice = row.side === "long" ? entryPrice + live.unrealizedPnl / openQty : entryPrice - live.unrealizedPnl / openQty;
      const currentR = row.side === "long" ? (currentPrice - entryPrice) / riskDistance : (entryPrice - currentPrice) / riskDistance;

      const rules = await db
        .select()
        .from(strategyPartialRules)
        .where(and(eq(strategyPartialRules.strategyId, row.strategyId), gt(strategyPartialRules.rrLevel, "0")))
        .orderBy(strategyPartialRules.rrLevel);

      for (const rule of rules) {
        if (currentR < Number(rule.rrLevel)) continue;

        const [alreadyFired] = await db
          .select({ id: strategyRuleFires.id })
          .from(strategyRuleFires)
          .where(and(eq(strategyRuleFires.positionId, row.positionId), eq(strategyRuleFires.ruleId, rule.id)))
          .limit(1);
        if (alreadyFired) continue;

        const closeQty = openQty * (Number(rule.exitPct) / 100);
        try {
          const runner = await getRunner(row.provider);
          const result = await runner.closePosition(accountId, row.externalPositionId, closeQty);
          if (result.status !== "executed") {
            errors.push(`${row.positionId}: partial-rule close rejected — ${result.message}`);
            continue;
          }

          const remaining = openQty - closeQty;
          if (remaining <= 1e-8) {
            await db
              .update(positions)
              .set({ status: "closed", closeReason: "partial_rule_close", closedAt: new Date(), updatedAt: new Date() })
              .where(eq(positions.id, row.positionId));
          } else {
            await db
              .update(positions)
              .set({ quantity: remaining.toString(), updatedAt: new Date() })
              .where(eq(positions.id, row.positionId));
          }

          await db.insert(strategyRuleFires).values({
            id: crypto.randomUUID(),
            positionId: row.positionId,
            ruleId: rule.id,
            ruleType: "partial",
          });

          await logAudit({
            workspaceId: row.workspaceId,
            actorId: null,
            action: "strategy.partial_rule_fired",
            summary: `Booked ${rule.exitPct}% of ${row.symbol} at ${currentR.toFixed(2)}R (rule level ${rule.rrLevel}R)`,
          });

          fired += 1;
        } catch (error) {
          errors.push(`${row.positionId}: ${error instanceof Error ? error.message : "unknown error"}`);
        }
      }
    }
  }

  return { checked, fired, errors };
}
