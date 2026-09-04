// Shared time-window vocabulary for every tool that takes a range —
// see PLAN_AI_COPILOT.md §2.1 "Prices and charts". Every consumer learns
// this enum once instead of a different range shape per tool.
export const TIME_RANGES = [
  "5d",
  "1m",
  "3m",
  "6m",
  "ytd",
  "1y",
  "2y",
  "3y",
  "5y",
  "10y",
  "max",
] as const;

export type TimeRange = (typeof TIME_RANGES)[number];

// getIndiaDailyCandles/getCompanyChart fetch by a calendar-day lookback, not
// a trading-day count — pad past holidays/weekends so the requested window
// is never short-changed. "max" is best-effort: NSE's own history depth
// varies by symbol, and this is capped at 20y rather than truly unbounded
// so a single bad request can't ask for an unreasonable pull.
const RANGE_DAYS: Record<Exclude<TimeRange, "ytd">, number> = {
  "5d": 10,
  "1m": 35,
  "3m": 100,
  "6m": 195,
  "1y": 380,
  "2y": 740,
  "3y": 1100,
  "5y": 1830,
  "10y": 3660,
  max: 7300,
};

export function rangeToDays(range: TimeRange, now = new Date()): number {
  if (range === "ytd") {
    const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    return Math.max(1, Math.ceil((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)) + 3);
  }
  return RANGE_DAYS[range];
}

// correlate() needs enough points for a coefficient to mean anything —
// see PLAN_AI_COPILOT.md's `Exclude<TimeRange, "5d"|"1m">` on correlate's
// period param. 3m is roughly 60 trading days, comfortably above this.
export const MIN_POINTS_FOR_CORRELATION = 20;
export type CorrelationRange = Exclude<TimeRange, "5d" | "1m">;

export function isCorrelationRange(range: TimeRange): range is CorrelationRange {
  return range !== "5d" && range !== "1m";
}

// The codebase-wide result convention (lib/market, lib/research, lib/heatmap
// all return this shape already) — kept as-is per PLAN_AI_COPILOT.md §2
// principle 4: the model handles a dead feed gracefully when it's told why,
// and invents when it just gets an error string.
export type ToolResult<T> = { status: "ok"; data: T } | { status: "unavailable"; reason: string };

export function ok<T>(data: T): ToolResult<T> {
  return { status: "ok", data };
}

export function unavailable<T>(reason: string): ToolResult<T> {
  return { status: "unavailable", reason };
}
