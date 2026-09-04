import "server-only";
import { z } from "zod";
import type { Market } from "@/db/schema";
import { getAllPositions, getPositions } from "@/lib/positions/queries";
import type { PositionRow } from "@/lib/positions/types";
import { computePerformanceKpis, generateInsights, MARKET_CURRENCY, type MoneyByCurrency } from "@/lib/performance/queries";
import { ok, type ToolResult } from "./shared";

// Every tool in this file is workspace-scoped from the server session only
// — `ctx.workspaceId` is never part of the model-facing Zod schema below,
// so there is no way for a model-supplied argument to widen the query.
// See PLAN_AI_COPILOT.md §7 "Cross-workspace data leak".
export type OwnDataCtx = { workspaceId: string };

const MARKET_VALUES = ["forex", "indian_options", "indian_equity"] as const satisfies readonly Market[];

// --- get_my_positions ----------------------------------------------------

export const getMyPositionsInputSchema = z.object({
  status: z.enum(["open", "closed"]).optional(),
  market: z.enum(MARKET_VALUES).optional(),
  symbol: z.string().optional(),
  strategyId: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});
export type GetMyPositionsInput = z.infer<typeof getMyPositionsInputSchema>;

export type MyPositionRow = {
  symbol: string;
  market: Market;
  side: "long" | "short";
  status: "open" | "closed";
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  pnl: number | null;
  rr: number | null;
  strategyLabel: string | null;
  accountLabel: string;
  openedAt: string;
  closedAt: string | null;
};

function toMyPositionRow(p: PositionRow): MyPositionRow {
  return {
    symbol: p.symbol,
    market: p.market,
    side: p.side,
    status: p.status,
    entryPrice: p.entryPrice,
    exitPrice: p.exitPrice,
    quantity: p.quantity,
    pnl: p.pnl,
    rr: p.rr,
    strategyLabel: p.strategyLabel,
    accountLabel: p.accountLabel,
    openedAt: p.openedAt.toISOString(),
    closedAt: p.closedAt?.toISOString() ?? null,
  };
}

export async function getMyPositions(
  input: GetMyPositionsInput,
  ctx: OwnDataCtx,
): Promise<ToolResult<{ positions: MyPositionRow[]; summary: { open: number; exposure: MoneyByCurrency; unrealizedPnl: MoneyByCurrency } }>> {
  const all = input.market ? await getPositions(ctx.workspaceId, input.market) : await getAllPositions(ctx.workspaceId);

  const filtered = all.filter(
    (p) => (!input.status || p.status === input.status) && (!input.symbol || p.symbol.toUpperCase() === input.symbol.toUpperCase()) && (!input.strategyId || p.strategyId === input.strategyId),
  );

  const openRows = filtered.filter((p) => p.status === "open");
  const exposure: MoneyByCurrency = {};
  const unrealizedPnl: MoneyByCurrency = {};
  for (const p of openRows) {
    const currency = MARKET_CURRENCY[p.market];
    exposure[currency] = (exposure[currency] ?? 0) + p.entryPrice * p.quantity;
    unrealizedPnl[currency] = (unrealizedPnl[currency] ?? 0) + (p.pnl ?? 0);
  }

  return ok({
    positions: filtered.slice(0, input.limit).map(toMyPositionRow),
    summary: { open: openRows.length, exposure, unrealizedPnl },
  });
}

// --- analyze_my_performance ----------------------------------------------

const PERIOD_VALUES = ["7d", "30d", "90d", "180d", "ytd", "1y", "3y", "5y", "all"] as const;
type Period = (typeof PERIOD_VALUES)[number];

const DIMENSION_VALUES = ["symbol", "strategy", "weekday", "hour", "side", "market", "overall"] as const;
type Dimension = (typeof DIMENSION_VALUES)[number];

export const analyzeMyPerformanceInputSchema = z.object({
  dimension: z.enum(DIMENSION_VALUES),
  period: z.enum(PERIOD_VALUES),
  market: z.enum(MARKET_VALUES).optional(),
});
export type AnalyzeMyPerformanceInput = z.infer<typeof analyzeMyPerformanceInputSchema>;

function periodCutoff(period: Period, now = new Date()): Date | null {
  if (period === "all") return null;
  if (period === "ytd") return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const days: Record<Exclude<Period, "all" | "ytd">, number> = { "7d": 7, "30d": 30, "90d": 90, "180d": 180, "1y": 365, "3y": 1095, "5y": 1825 };
  return new Date(now.getTime() - days[period] * 24 * 60 * 60 * 1000);
}

export type PerformanceBreakdownRow = { key: string; trades: number; winRate: number; net: number; avgR: number | null };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function groupKey(row: PositionRow, dimension: Exclude<Dimension, "overall">): string {
  switch (dimension) {
    case "symbol":
      return row.symbol;
    case "strategy":
      return row.strategyLabel ?? "(no strategy)";
    case "side":
      return row.side;
    case "market":
      return row.market;
    case "weekday":
      return row.closedAt ? WEEKDAYS[row.closedAt.getUTCDay()] : "(unknown)";
    case "hour":
      return row.closedAt ? `${row.closedAt.getUTCHours()}:00 UTC` : "(unknown)";
  }
}

/** Same grouping shape as lib/performance/queries.ts's computeSymbolPerformance, generalized to any of the dimensions this tool exposes — that function only ever grouped by symbol, and weekday/hour/side/market/strategy breakdowns don't exist anywhere else in the codebase yet. */
function computeBreakdown(rows: PositionRow[], dimension: Exclude<Dimension, "overall">): Record<"USD" | "INR", PerformanceBreakdownRow[]> {
  const result = {} as Record<"USD" | "INR", PerformanceBreakdownRow[]>;
  for (const currency of ["USD", "INR"] as const) {
    const closed = rows.filter((p) => p.status === "closed" && MARKET_CURRENCY[p.market] === currency);
    const byKey = new Map<string, PositionRow[]>();
    for (const p of closed) {
      const key = groupKey(p, dimension);
      const list = byKey.get(key) ?? [];
      list.push(p);
      byKey.set(key, list);
    }
    result[currency] = Array.from(byKey.entries())
      .map(([key, trades]) => {
        const wins = trades.filter((p) => (p.pnl ?? 0) > 0).length;
        const net = trades.reduce((sum, p) => sum + (p.pnl ?? 0), 0);
        const rValues = trades.map((p) => p.rr).filter((r): r is number => r !== null);
        return { key, trades: trades.length, winRate: (wins / trades.length) * 100, net, avgR: rValues.length > 0 ? rValues.reduce((s, r) => s + r, 0) / rValues.length : null };
      })
      .sort((a, b) => b.net - a.net);
  }
  return result;
}

/**
 * Thin dispatcher over lib/performance/queries.ts's existing, already-tested
 * computations for `overall`; the other dimensions reuse the same per-
 * currency grouping shape via computeBreakdown() above, since those specific
 * breakdowns weren't implemented anywhere else. Keeps currencies separate
 * throughout (Record<"USD"|"INR", …>) — never summed across markets, same
 * discipline as the rest of lib/performance.
 */
export async function analyzeMyPerformance(input: AnalyzeMyPerformanceInput, ctx: OwnDataCtx) {
  const all = input.market ? await getPositions(ctx.workspaceId, input.market) : await getAllPositions(ctx.workspaceId);
  const cutoff = periodCutoff(input.period);
  const rows = cutoff ? all.filter((p) => (p.closedAt ?? p.openedAt) >= cutoff) : all;

  const kpis = computePerformanceKpis(rows);
  const insights = generateInsights(rows);
  const breakdown = input.dimension === "overall" ? null : computeBreakdown(rows, input.dimension);

  return ok({ kpis, insights, breakdown, tradesConsidered: rows.length });
}
