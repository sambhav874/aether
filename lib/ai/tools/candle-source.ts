import "server-only";
import { getIndiaDailyCandles, type CandleChartResult } from "@/lib/market/india-chart";
import { getCompanyChart } from "@/lib/research/company";

export type CandleMarket = "india" | "us";
export type CandleKind = "equity" | "index";

/**
 * Shared routing between get_candles and compute_indicators/correlate —
 * see candles.ts's docstring for why India indices and everything else take
 * different upstream paths. Kept in one place so the two tools can't drift.
 */
export async function fetchDailyCandles(symbol: string, kind: CandleKind, market: CandleMarket, days: number): Promise<CandleChartResult> {
  if (market === "india" && kind === "index") {
    return getIndiaDailyCandles(symbol, "index", days);
  }
  return getCompanyChart(symbol, days);
}
