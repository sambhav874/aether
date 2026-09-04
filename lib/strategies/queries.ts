import "server-only";
import { eq, and, gte, desc, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { strategies, signals, strategyAccounts } from "@/db/schema/strategies";
import type { StrategyRow, SignalRow } from "@/lib/strategies/types";

export async function getStrategies(workspaceId: string): Promise<StrategyRow[]> {
  const rows = await db
    .select()
    .from(strategies)
    .where(eq(strategies.workspaceId, workspaceId))
    .orderBy(desc(strategies.createdAt));

  if (rows.length === 0) return [];

  const strategyIds = rows.map((r) => r.id);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [last24h, lastTriggered, sparklineRows, linkedAccountRows, todayRows, hourlyRows] = await Promise.all([
    db
      .select({ strategyId: signals.strategyId, count: sql<number>`count(*)::int` })
      .from(signals)
      .where(and(inArray(signals.strategyId, strategyIds), gte(signals.receivedAt, since24h)))
      .groupBy(signals.strategyId),
    db
      .select({ strategyId: signals.strategyId, lastTriggeredAt: sql<Date>`max(${signals.receivedAt})` })
      .from(signals)
      .where(inArray(signals.strategyId, strategyIds))
      .groupBy(signals.strategyId),
    db
      .select({
        strategyId: signals.strategyId,
        day: sql<string>`to_char(${signals.receivedAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(signals)
      .where(and(inArray(signals.strategyId, strategyIds), gte(signals.receivedAt, since7d)))
      .groupBy(signals.strategyId, sql`to_char(${signals.receivedAt}, 'YYYY-MM-DD')`),
    db
      .select({ strategyId: strategyAccounts.strategyId, accountId: strategyAccounts.accountId })
      .from(strategyAccounts)
      .where(inArray(strategyAccounts.strategyId, strategyIds)),
    db
      .select({ strategyId: signals.strategyId, count: sql<number>`count(*)::int` })
      .from(signals)
      .where(and(inArray(signals.strategyId, strategyIds), gte(signals.receivedAt, todayStart)))
      .groupBy(signals.strategyId),
    // Hour-of-received-at, relative to now (0 = current hour, 23 = 23 hours
    // ago), split by side. `total` includes MODIFY/etc signals with a null
    // side, which `long`/`short` deliberately exclude.
    db
      .select({
        strategyId: signals.strategyId,
        hoursAgo: sql<number>`floor(extract(epoch from (now() - ${signals.receivedAt})) / 3600)::int`,
        side: signals.side,
        count: sql<number>`count(*)::int`,
      })
      .from(signals)
      .where(and(inArray(signals.strategyId, strategyIds), gte(signals.receivedAt, since24h)))
      .groupBy(signals.strategyId, sql`floor(extract(epoch from (now() - ${signals.receivedAt})) / 3600)::int`, signals.side),
  ]);

  const last24hMap = new Map(last24h.map((r) => [r.strategyId, r.count]));
  const lastTriggeredMap = new Map(
    lastTriggered.map((r) => [r.strategyId, r.lastTriggeredAt ? new Date(r.lastTriggeredAt) : null]),
  );
  const sparklineMap = new Map<string, { date: string; count: number }[]>();
  for (const row of sparklineRows) {
    const list = sparklineMap.get(row.strategyId) ?? [];
    list.push({ date: row.day, count: row.count });
    sparklineMap.set(row.strategyId, list);
  }
  const linkedAccountsMap = new Map<string, string[]>();
  for (const row of linkedAccountRows) {
    const list = linkedAccountsMap.get(row.strategyId) ?? [];
    list.push(row.accountId);
    linkedAccountsMap.set(row.strategyId, list);
  }
  const todayMap = new Map(todayRows.map((r) => [r.strategyId, r.count]));

  const signalHistoryMap = new Map<string, { long: number; short: number; total: number }[]>();
  for (const strategyId of strategyIds) {
    signalHistoryMap.set(
      strategyId,
      Array.from({ length: 24 }, () => ({ long: 0, short: 0, total: 0 })),
    );
  }
  for (const row of hourlyRows) {
    if (row.hoursAgo < 0 || row.hoursAgo > 23) continue;
    const buckets = signalHistoryMap.get(row.strategyId);
    if (!buckets) continue;
    // Index 0 = oldest (23h ago), index 23 = current hour.
    const bucket = buckets[23 - row.hoursAgo];
    bucket.total += row.count;
    if (row.side === "long") bucket.long += row.count;
    else if (row.side === "short") bucket.short += row.count;
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    market: row.market,
    handleType: row.handleType,
    defaultSymbol: row.defaultSymbol,
    status: row.status,
    signalsLast24h: last24hMap.get(row.id) ?? 0,
    lastTriggeredAt: lastTriggeredMap.get(row.id) ?? null,
    sparkline: (sparklineMap.get(row.id) ?? []).sort((a, b) => (a.date < b.date ? -1 : 1)),
    linkedAccountIds: linkedAccountsMap.get(row.id) ?? [],
    createdAt: row.createdAt,
    coolDownPeriod: row.coolDownPeriod,
    maxTriggersPerDay: row.maxTriggersPerDay,
    isGlobal: row.isGlobal,
    allowEntry: row.allowEntry,
    allowExit: row.allowExit,
    allowModify: row.allowModify,
    hasWebhookSecret: row.webhookSecret !== null,
    triggersToday: todayMap.get(row.id) ?? 0,
    signalHistory: signalHistoryMap.get(row.id) ?? [],
  }));
}

export async function getSignalHistory(strategyId: string, limit = 50): Promise<SignalRow[]> {
  const rows = await db
    .select()
    .from(signals)
    .where(eq(signals.strategyId, strategyId))
    .orderBy(desc(signals.receivedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    action: row.action,
    side: row.side,
    symbol: row.symbol,
    tag: row.tag,
    sl: row.sl,
    target: row.target,
    status: row.status,
    resultMessage: row.resultMessage,
    receivedAt: row.receivedAt,
  }));
}
