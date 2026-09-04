import "server-only";
import { z } from "zod";
import { and, or, eq, gt, gte, lt, lte, asc, desc, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { instrumentFundamentals } from "@/db/schema/ai";
import { ok, unavailable, type ToolResult } from "./shared";

// Deliberately not "nifty50"/"nifty500"/"sp500" — this deployment has no
// verified index-constituent list to screen against (see
// lib/ai/screening/refresh-fundamentals.ts's docstring), only the curated
// symbol sets the rest of the product already uses. Naming the universe
// after an index this can't actually verify membership for would be worse
// than naming it honestly.
export const SCREEN_UNIVERSES = ["us_equity", "india_equity", "all", "custom"] as const;
export type ScreenUniverse = (typeof SCREEN_UNIVERSES)[number];

export const SCREEN_METRICS = ["marketCap", "pe", "pb", "roe", "revenueGrowth", "profitMargin", "debtToEquity", "dividendYield", "beta"] as const;
export type ScreenMetric = (typeof SCREEN_METRICS)[number];

const METRIC_COLUMN = {
  marketCap: instrumentFundamentals.marketCap,
  pe: instrumentFundamentals.pe,
  pb: instrumentFundamentals.pb,
  roe: instrumentFundamentals.roe,
  revenueGrowth: instrumentFundamentals.revenueGrowth,
  profitMargin: instrumentFundamentals.profitMargin,
  debtToEquity: instrumentFundamentals.debtToEquity,
  dividendYield: instrumentFundamentals.dividendYield,
  beta: instrumentFundamentals.beta,
} as const;

const filterSchema = z.object({
  metric: z.string().describe("Metric name (e.g. marketCap, pe, pb, roe, revenueGrowth, profitMargin, debtToEquity, dividendYield, beta)"),
  op: z.enum(["gt", "gte", "lt", "lte", "eq"]).default("gt"),
  value: z.number().or(z.string().transform(Number)).default(0),
});

export const screenStocksInputSchema = z
  .object({
    universe: z.string().default("india_equity").describe("Universe to screen ('india_equity', 'us_equity', 'all', 'custom')"),
    symbols: z.array(z.string()).optional(),
    filters: z.array(filterSchema).default([]),
    sort: z
      .object({
        metric: z.string().describe("Metric name to sort by"),
        dir: z.enum(["asc", "desc"]).default("desc"),
      })
      .optional(),
    limit: z.number().default(25),
    sector: z.string().optional(),
  })
  .transform((input) => {
    let univ: ScreenUniverse = "india_equity";
    if (input.universe === "us_equity" || input.universe === "us") univ = "us_equity";
    else if (input.universe === "all") univ = "all";
    else if (input.universe === "custom") univ = "custom";
    else univ = "india_equity";

    const normalizedSort = input.sort
      ? {
          metric: (SCREEN_METRICS.includes(input.sort.metric as ScreenMetric) ? input.sort.metric : "marketCap") as ScreenMetric,
          dir: input.sort.dir ?? "desc",
        }
      : undefined;

    const normalizedFilters = input.filters
      .filter((f) => SCREEN_METRICS.includes(f.metric as ScreenMetric))
      .map((f) => ({
        metric: f.metric as ScreenMetric,
        op: f.op,
        value: typeof f.value === "number" && !isNaN(f.value) ? f.value : 0,
      }));

    return {
      universe: univ,
      symbols: input.symbols,
      filters: normalizedFilters,
      sort: normalizedSort,
      limit: typeof input.limit === "number" ? Math.min(Math.max(1, input.limit), 100) : 25,
      sector: input.sector,
    };
  });
export type ScreenStocksRawInput = z.input<typeof screenStocksInputSchema>;
export type ScreenStocksInput = z.infer<typeof screenStocksInputSchema>;

export type ScreenMatch = { symbol: string; name: string; sector: string | null } & Partial<Record<ScreenMetric, number | null>>;

function toCondition(filter: { metric: ScreenMetric; op: "gt" | "gte" | "lt" | "lte" | "eq"; value: number }): SQL {
  const column = METRIC_COLUMN[filter.metric];
  const value = String(filter.value);
  switch (filter.op) {
    case "gt":
      return gt(column, value);
    case "gte":
      return gte(column, value);
    case "lt":
      return lt(column, value);
    case "lte":
      return lte(column, value);
    case "eq":
      return eq(column, value);
  }
}

/**
 * Reads the nightly-refreshed instrument_fundamentals snapshot — see
 * refresh-fundamentals.ts's docstring for why this can't be a live
 * per-symbol sweep. `asOf` on the result is the oldest `refreshedAt` among
 * the matches, so a stale/never-run snapshot is visible rather than silent.
 */
export async function screenStocks(rawInput: ScreenStocksRawInput | ScreenStocksInput): Promise<ToolResult<{ matches: ScreenMatch[]; total: number; asOf: string | null }>> {
  const input = screenStocksInputSchema.parse(rawInput);
  if (input.universe === "custom" && (!input.symbols || input.symbols.length === 0)) {
    return unavailable("universe 'custom' requires a non-empty symbols list");
  }

  const conditions: SQL[] = input.filters.map(toCondition);
  if (input.universe === "us_equity") conditions.push(eq(instrumentFundamentals.exchange, "US"));
  if (input.universe === "india_equity") conditions.push(eq(instrumentFundamentals.exchange, "NSE"));
  if (input.universe === "custom" && input.symbols) {
    const symbolConds = input.symbols.map((s) => eq(instrumentFundamentals.symbol, s));
    conditions.push(or(...symbolConds) as SQL);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const orderBy = input.sort ? (input.sort.dir === "asc" ? asc(METRIC_COLUMN[input.sort.metric]) : desc(METRIC_COLUMN[input.sort.metric])) : desc(instrumentFundamentals.marketCap);

  const rows = await db.select().from(instrumentFundamentals).where(where).orderBy(orderBy).limit(input.limit);

  if (rows.length === 0) {
    return ok({ matches: [], total: 0, asOf: null });
  }

  const asOf = rows.reduce<Date | null>((oldest, r) => (!oldest || r.refreshedAt < oldest ? r.refreshedAt : oldest), null);

  const matches: ScreenMatch[] = rows.map((r) => ({
    symbol: r.symbol,
    name: r.name,
    sector: r.sector,
    marketCap: r.marketCap !== null ? Number(r.marketCap) : null,
    pe: r.pe !== null ? Number(r.pe) : null,
    pb: r.pb !== null ? Number(r.pb) : null,
    roe: r.roe !== null ? Number(r.roe) : null,
    revenueGrowth: r.revenueGrowth !== null ? Number(r.revenueGrowth) : null,
    profitMargin: r.profitMargin !== null ? Number(r.profitMargin) : null,
    debtToEquity: r.debtToEquity !== null ? Number(r.debtToEquity) : null,
    dividendYield: r.dividendYield !== null ? Number(r.dividendYield) : null,
    beta: r.beta !== null ? Number(r.beta) : null,
  }));

  return ok({ matches, total: matches.length, asOf: asOf?.toISOString() ?? null });
}
