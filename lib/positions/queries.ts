import "server-only";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { brokerAccounts, positions, strategies, basketPositions, baskets } from "@/db/schema";
import type { Market } from "@/db/schema";
import type { PositionKpis, PositionRow } from "@/lib/positions/types";
import type { PnlPoint } from "@/components/trading-module/cumulative-pnl-panel";

function baseQuery() {
  return db
    .select({
      id: positions.id,
      accountId: positions.accountId,
      market: positions.market,
      symbol: positions.symbol,
      side: positions.side,
      entryPrice: positions.entryPrice,
      exitPrice: positions.exitPrice,
      quantity: positions.quantity,
      filledQuantity: positions.filledQuantity,
      status: positions.status,
      closeReason: positions.closeReason,
      pnl: positions.pnl,
      rr: positions.rr,
      sl: positions.sl,
      strategyId: positions.strategyId,
      strategyName: strategies.name,
      openedAt: positions.openedAt,
      closedAt: positions.closedAt,
      accountLabel: brokerAccounts.label,
      provider: brokerAccounts.provider,
      accountCurrency: brokerAccounts.currency,
      // Scalar subquery, not a join — a position can in principle belong to
      // more than one basket, and a join would silently duplicate the row.
      // Picks the most recently-added basket link deterministically.
      basketName: sql<string | null>`(
        select ${baskets.name} from ${basketPositions}
        inner join ${baskets} on ${baskets.id} = ${basketPositions.basketId}
        where ${basketPositions.positionId} = ${positions.id}
        order by ${baskets.createdAt} desc
        limit 1
      )`.as("basket_name"),
    })
    .from(positions)
    .innerJoin(brokerAccounts, eq(positions.accountId, brokerAccounts.id))
    .leftJoin(strategies, eq(positions.strategyId, strategies.id));
}

function toPositionRow(row: Awaited<ReturnType<typeof baseQuery>>[number]): PositionRow {
  return {
    id: row.id,
    accountId: row.accountId,
    strategyId: row.strategyId,
    market: row.market,
    symbol: row.symbol,
    side: row.side,
    entryPrice: Number(row.entryPrice),
    exitPrice: row.exitPrice !== null ? Number(row.exitPrice) : null,
    quantity: Number(row.quantity),
    filledQuantity: row.filledQuantity !== null ? Number(row.filledQuantity) : null,
    status: row.status,
    closeReason: row.closeReason,
    pnl: row.pnl !== null ? Number(row.pnl) : null,
    rr: row.rr !== null ? Number(row.rr) : null,
    sl: row.sl !== null ? Number(row.sl) : null,
    strategyLabel: row.strategyName,
    accountLabel: row.accountLabel,
    provider: row.provider,
    currency: row.accountCurrency === "INR" ? "INR" : "USD",
    basketName: row.basketName,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
  };
}

/**
 * Upper bound on rows any single position query will load.
 *
 * These feed pages that aggregate across the whole set — KPIs, the equity
 * curve — so a page-at-a-time cursor would produce wrong totals rather than a
 * shorter list. A generous cap plus a visible truncation flag is the honest
 * shape: memory stays bounded, and when a workspace outgrows it the UI can
 * say so instead of quietly charting a subset.
 */
export const POSITION_QUERY_LIMIT = 5_000;

export type PositionPage = { rows: PositionRow[]; truncated: boolean };

export async function getPositions(workspaceId: string, market: Market): Promise<PositionRow[]> {
  const rows = await baseQuery()
    .where(and(eq(positions.workspaceId, workspaceId), eq(positions.market, market)))
    .orderBy(desc(positions.openedAt))
    .limit(POSITION_QUERY_LIMIT);
  return rows.map(toPositionRow);
}

/** Cross-market — used by the Performance page, which aggregates across all
 * three markets (each row still carries its own `market`/currency). */
export async function getAllPositions(workspaceId: string): Promise<PositionRow[]> {
  return (await getAllPositionsPage(workspaceId)).rows;
}

/**
 * Same query, but says whether it hit the cap. Callers that chart or total
 * the result should use this and tell the user when they are looking at a
 * subset — a truncated equity curve that looks complete is worse than one
 * labelled as partial.
 */
export async function getAllPositionsPage(workspaceId: string): Promise<PositionPage> {
  const rows = await baseQuery()
    .where(eq(positions.workspaceId, workspaceId))
    .orderBy(desc(positions.openedAt))
    // One extra row is the cheapest way to know there are more.
    .limit(POSITION_QUERY_LIMIT + 1);

  const truncated = rows.length > POSITION_QUERY_LIMIT;
  return { rows: rows.slice(0, POSITION_QUERY_LIMIT).map(toPositionRow), truncated };
}

const INDIAN_PROVIDERS = ["dhan", "motilal", "zerodha"] as const;

/** Sum of available balance across connected Indian broker accounts
 * (Dhan/Motilal/Zerodha) — MetaAPI excluded, it's the forex bridge. */
export async function getIndianBrokerBalance(workspaceId: string): Promise<number> {
  const rows = await db
    .select({ balance: brokerAccounts.balance })
    .from(brokerAccounts)
    .where(
      and(
        eq(brokerAccounts.workspaceId, workspaceId),
        inArray(brokerAccounts.provider, INDIAN_PROVIDERS),
        ne(brokerAccounts.status, "disconnected"),
      ),
    );
  return rows.reduce((sum, row) => sum + (row.balance ? Number(row.balance) : 0), 0);
}

/** Most-recent positions for one strategy — powers the strategy list's
 * expanded-row Positions tab. */
export async function getPositionsByStrategy(strategyId: string, limit = 20): Promise<PositionRow[]> {
  const rows = await baseQuery()
    .where(eq(positions.strategyId, strategyId))
    .orderBy(desc(positions.openedAt))
    .limit(limit);
  return rows.map(toPositionRow);
}

function isToday(date: Date) {
  return date.toDateString() === new Date().toDateString();
}

/**
 * Which currency a page's figures are in, taken from the positions
 * themselves rather than assumed from the market. A workspace can hold
 * accounts in more than one currency on the same market, and summing across
 * them would be arithmetic on incomparable numbers — so the aggregate is
 * computed over the dominant currency only and the caller is told what it
 * left out. Per-row amounts always use the row's own currency.
 */
export function resolveCurrency(
  rows: PositionRow[],
  fallback: "USD" | "INR",
): { currency: "USD" | "INR"; totalsRows: PositionRow[]; excluded: { count: number; currencies: ("USD" | "INR")[] } } {
  if (rows.length === 0) {
    return { currency: fallback, totalsRows: rows, excluded: { count: 0, currencies: [] } };
  }

  const counts = new Map<"USD" | "INR", number>();
  for (const row of rows) counts.set(row.currency, (counts.get(row.currency) ?? 0) + 1);

  const [currency] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const totalsRows = rows.filter((r) => r.currency === currency);
  const others = [...counts.keys()].filter((c) => c !== currency);

  return {
    currency,
    totalsRows,
    excluded: { count: rows.length - totalsRows.length, currencies: others },
  };
}

export function computeKpis(rows: PositionRow[]): PositionKpis {
  const open = rows.filter((p) => p.status === "open");
  const closed = rows.filter((p) => p.status === "closed");
  const todaysTrades = rows.filter((p) => isToday(p.closedAt ?? p.openedAt)).length;

  const realizedPnl = closed.reduce((sum, p) => sum + (p.pnl ?? 0), 0);
  const unrealizedPnl = open.reduce((sum, p) => sum + (p.pnl ?? 0), 0);

  const winners = closed.filter((p) => (p.pnl ?? 0) > 0);
  const winRate = closed.length > 0 ? (winners.length / closed.length) * 100 : null;

  const rMultiples = closed.map((p) => p.rr).filter((rr): rr is number => rr !== null);
  const averageR =
    rMultiples.length > 0 ? rMultiples.reduce((sum, r) => sum + r, 0) / rMultiples.length : null;

  const chronological = [...closed].sort(
    (a, b) => (a.closedAt?.getTime() ?? 0) - (b.closedAt?.getTime() ?? 0),
  );
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const position of chronological) {
    cumulative += position.pnl ?? 0;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }

  return {
    openPositions: open.length,
    todaysTrades,
    realizedPnl,
    unrealizedPnl,
    winRate,
    averageR,
    maxDrawdown,
    totalTrades: closed.length,
  };
}

export function computePnlPoints(rows: PositionRow[]): PnlPoint[] {
  const closed = [...rows]
    .filter((p) => p.status === "closed" && p.closedAt)
    .sort((a, b) => a.closedAt!.getTime() - b.closedAt!.getTime());

  const byDay = new Map<string, number>();
  for (const position of closed) {
    const key = position.closedAt!.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + (position.pnl ?? 0));
  }

  let cumulative = 0;
  return Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, dailyPnl]) => {
      cumulative += dailyPnl;
      return { date, cumulative };
    });
}
