import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { signals } from "@/db/schema/strategies";
import { istDayStartUtc } from "@/lib/market-hours";

export type RateLimitResult = { ok: true } | { ok: false; reason: string };

/**
 * Both checks read from the same one-row aggregate query — cheap enough to
 * run on every signal even though most strategies have neither limit set.
 */
export async function checkStrategyRateLimit(
  strategyId: string,
  coolDownPeriod: number | null,
  maxTriggersPerDay: number | null,
): Promise<RateLimitResult> {
  if (!coolDownPeriod && !maxTriggersPerDay) return { ok: true };

  // IST, not UTC: a UTC-midnight window rolls at 05:30 IST, resetting the
  // daily cap in the middle of the NSE session.
  const todayStartIso = istDayStartUtc().toISOString();

  // extract(epoch from ...) returns a plain number regardless of how the
  // driver would otherwise parse a naive timestamp column — `receivedAt` has
  // no timezone attached, and postgres.js was returning it as an ambiguous
  // string (not a Date) for this aggregate expression, which is a much worse
  // failure mode than a numeric epoch that can't be misread.
  const [row] = await db
    .select({
      lastAtEpoch: sql<string | null>`extract(epoch from max(${signals.receivedAt}))`,
      todayCount: sql<number>`count(*) filter (where ${signals.receivedAt} >= ${todayStartIso}::timestamp)::int`,
    })
    .from(signals)
    .where(eq(signals.strategyId, strategyId));

  const lastAtMs = row?.lastAtEpoch !== null && row?.lastAtEpoch !== undefined ? Number(row.lastAtEpoch) * 1000 : null;

  if (coolDownPeriod && lastAtMs !== null) {
    const elapsedSeconds = (Date.now() - lastAtMs) / 1000;
    if (elapsedSeconds < coolDownPeriod) {
      const remaining = Math.ceil(coolDownPeriod - elapsedSeconds);
      return { ok: false, reason: `strategy is in cooldown — ${remaining}s remaining` };
    }
  }

  if (maxTriggersPerDay && (row?.todayCount ?? 0) >= maxTriggersPerDay) {
    return { ok: false, reason: `strategy has hit its daily trigger cap (${maxTriggersPerDay}/day)` };
  }

  return { ok: true };
}
