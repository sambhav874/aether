import "server-only";
import { z } from "zod";
import type { ChartCandle } from "@/lib/market/india-chart";
import { fetchDailyCandles, type CandleKind, type CandleMarket } from "./candle-source";
import { TIME_RANGES, MIN_POINTS_FOR_CORRELATION, rangeToDays, isCorrelationRange, ok, unavailable, type ToolResult } from "./shared";
import { sma, ema, rsi, atr, realizedVolatility, positionInRange, drawdown, periodReturn, cagr, dailyReturns, pearsonCorrelation } from "./indicator-math";

// --- compute_indicators -----------------------------------------------

export const INDICATOR_NAMES = [
  "sma20",
  "sma50",
  "sma200",
  "ema20",
  "ema50",
  "rsi14",
  "atr14",
  "vol20",
  "pos52w",
  "drawdown",
  "ret1w",
  "ret1m",
  "ret3m",
  "ret6m",
  "retYtd",
  "ret1y",
  "ret3y",
  "ret5y",
  "cagr3y",
  "cagr5y",
] as const;
export type IndicatorName = (typeof INDICATOR_NAMES)[number];

export const computeIndicatorsInputSchema = z.object({
  symbol: z.string(),
  kind: z.enum(["equity", "index"]),
  market: z.enum(["india", "us"]),
  // Governs `drawdown`'s window explicitly; for every other indicator it's
  // only a fetch-window floor — sma20/ret1y/etc. are self-describing and
  // always use their own named period regardless of this value.
  range: z.enum(TIME_RANGES).optional(),
  indicators: z.array(z.enum(INDICATOR_NAMES)).min(1),
});
export type ComputeIndicatorsInput = z.infer<typeof computeIndicatorsInputSchema>;

// Trading-day window each self-describing indicator needs, independent of
// the outer `range` — sma20 is always the last 20 trading days, ret1y is
// always the last ~252, and so on.
const INDICATOR_TRADING_DAYS: Record<Exclude<IndicatorName, "retYtd" | "drawdown">, number> = {
  sma20: 20,
  sma50: 50,
  sma200: 200,
  ema20: 20,
  ema50: 50,
  rsi14: 15,
  atr14: 15,
  vol20: 21,
  pos52w: 252,
  ret1w: 6,
  ret1m: 22,
  ret3m: 64,
  ret6m: 127,
  ret1y: 252,
  ret3y: 756,
  ret5y: 1260,
  cagr3y: 756,
  cagr5y: 1260,
};

function tradingDaysToCalendarDays(tradingDays: number): number {
  return Math.ceil(tradingDays * (365 / 252)) + 20;
}

function fetchWindowDays(input: ComputeIndicatorsInput): number {
  const maxTradingDays = Math.max(
    252, // never fetch less than ~1y — cheap enough, and covers pos52w/drawdown by default
    ...input.indicators.filter((i): i is Exclude<IndicatorName, "retYtd" | "drawdown"> => i !== "retYtd" && i !== "drawdown").map((i) => INDICATOR_TRADING_DAYS[i]),
  );
  const floor = tradingDaysToCalendarDays(maxTradingDays);
  const rangeFloor = input.range ? rangeToDays(input.range) : 0;
  return Math.min(rangeToDays("max"), Math.max(floor, rangeFloor));
}

function lastN(candles: ChartCandle[], n: number): ChartCandle[] | null {
  return candles.length >= n ? candles.slice(candles.length - n) : null;
}

function ytdSlice(candles: ChartCandle[]): ChartCandle[] | null {
  const year = new Date().getUTCFullYear();
  const slice = candles.filter((c) => c.time >= `${year}-01-01`);
  return slice.length >= 2 ? slice : null;
}

function computeOne(name: IndicatorName, candles: ChartCandle[], range: ComputeIndicatorsInput["range"]): number | null {
  const closes = candles.map((c) => c.close);
  switch (name) {
    case "sma20":
      return sma(closes, 20);
    case "sma50":
      return sma(closes, 50);
    case "sma200":
      return sma(closes, 200);
    case "ema20":
      return ema(closes, 20);
    case "ema50":
      return ema(closes, 50);
    case "rsi14":
      return rsi(closes, 14);
    case "atr14":
      return atr(candles, 14);
    case "vol20":
      return realizedVolatility(candles, 20);
    case "pos52w": {
      const window = lastN(candles, 252) ?? candles;
      return positionInRange(window);
    }
    case "drawdown": {
      const window = range ? lastN(candles, Math.min(candles.length, Math.round(rangeToDays(range) * (252 / 365)))) ?? candles : lastN(candles, 252) ?? candles;
      return drawdown(window);
    }
    case "ret1w":
      return periodReturn(lastN(candles, 6) ?? []);
    case "ret1m":
      return periodReturn(lastN(candles, 22) ?? []);
    case "ret3m":
      return periodReturn(lastN(candles, 64) ?? []);
    case "ret6m":
      return periodReturn(lastN(candles, 127) ?? []);
    case "retYtd":
      return periodReturn(ytdSlice(candles) ?? []);
    case "ret1y":
      return periodReturn(lastN(candles, 252) ?? []);
    case "ret3y":
      return periodReturn(lastN(candles, 756) ?? []);
    case "ret5y":
      return periodReturn(lastN(candles, 1260) ?? []);
    case "cagr3y":
      return cagr(lastN(candles, 756) ?? [], 3);
    case "cagr5y":
      return cagr(lastN(candles, 1260) ?? [], 5);
  }
}

/**
 * Computes a batch of named indicators from one fetch of daily candles —
 * this tool plus compare_fundamentals (fundamentals.ts) are the enforcement
 * mechanism for PLAN_AI_COPILOT.md invariant #2: there is no path by which
 * the model derives an RSI or a 5-year CAGR itself, because this is the
 * only way those numbers reach it.
 */
export async function computeIndicators(input: ComputeIndicatorsInput): Promise<ToolResult<{ symbol: string; values: Record<string, number | null>; asOf: string }>> {
  const days = fetchWindowDays(input);
  const result = await fetchDailyCandles(input.symbol, input.kind, input.market, days);
  if (result.status === "unavailable") return unavailable(result.reason);

  const values: Record<string, number | null> = {};
  for (const name of input.indicators) {
    values[name] = computeOne(name, result.candles, input.range);
  }

  return ok({ symbol: input.symbol, values, asOf: new Date().toISOString() });
}

// --- correlate -----------------------------------------------------------

const correlateSymbolSchema = z.object({
  symbol: z.string(),
  kind: z.enum(["equity", "index"]),
  market: z.enum(["india", "us"]),
});

const CORRELATION_RANGES = TIME_RANGES.filter(isCorrelationRange);

export const correlateInputSchema = z.object({
  symbols: z.array(correlateSymbolSchema).min(2).max(8),
  period: z.enum(CORRELATION_RANGES),
});
export type CorrelateInput = z.infer<typeof correlateInputSchema>;

/** Aligns candle series by common trading date across every symbol before computing returns — different markets/exchanges don't share a holiday calendar, so a naive positional alignment would silently compare the wrong days against each other. */
function alignByDate(seriesList: ChartCandle[][]): number[][] {
  const dateSets = seriesList.map((series) => new Map(series.map((c) => [c.time, c.close])));
  const commonDates = [...dateSets[0].keys()].filter((date) => dateSets.every((set) => set.has(date))).sort();
  return dateSets.map((set) => commonDates.map((date) => set.get(date)!));
}

/**
 * Pairwise Pearson correlation of daily returns across a basket of symbols —
 * see PLAN_AI_COPILOT.md §2.1. Refuses ranges too short to produce a
 * meaningful coefficient (`5d`/`1m` are excluded at the type level; this
 * still checks the *actual* aligned overlap, which can be shorter than the
 * requested range if a symbol has a short trading history or missing data).
 */
export async function correlate(
  input: CorrelateInput,
): Promise<ToolResult<{ matrix: number[][]; symbols: string[]; points?: { x: number; y: number }[] }>> {
  const days = rangeToDays(input.period);
  const results = await Promise.all(input.symbols.map((s) => fetchDailyCandles(s.symbol, s.kind, s.market, days)));

  const failed = results.find((r) => r.status === "unavailable");
  if (failed && failed.status === "unavailable") return unavailable(failed.reason);

  const series = results.map((r) => (r.status === "ok" ? r.candles : []));
  const aligned = alignByDate(series);

  if (aligned[0].length < MIN_POINTS_FOR_CORRELATION + 1) {
    return unavailable(`only ${aligned[0].length} overlapping trading days across these symbols — need at least ${MIN_POINTS_FOR_CORRELATION + 1}; use a longer period`);
  }

  const returns = aligned.map((prices) => {
    const rets: number[] = [];
    for (let i = 1; i < prices.length; i++) rets.push(Math.log(prices[i] / prices[i - 1]));
    return rets;
  });

  const symbols = input.symbols.map((s) => s.symbol);
  const matrix = symbols.map((_, i) => symbols.map((_, j) => (i === j ? 1 : (pearsonCorrelation(returns[i], returns[j]) ?? 0))));

  // For exactly 2 symbols, hand back ready-to-plot {x,y} return pairs — the
  // only way a scatter chart of "this correlation" can exist without the
  // model computing returns itself (forbidden by the system prompt's rule
  // 2) or inventing a seriesId render_chart has no way to resolve (seriesId
  // only works for kind:"candle", sourced from a prior get_candles call).
  const points = symbols.length === 2 ? returns[0].map((x, i) => ({ x, y: returns[1][i] })) : undefined;

  return ok({ matrix, symbols, points });
}

// Re-exported so callers of correlate() don't need a separate import just
// to type-check the `market`/`kind` shape it expects.
export type { CandleKind, CandleMarket };
export { dailyReturns };
