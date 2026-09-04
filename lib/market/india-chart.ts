import "server-only";
import { nse } from "@/lib/options/nse-provider";

export type ChartCandle = { time: string; open: number; high: number; low: number; close: number };

export type CandleChartResult =
  | { status: "ok"; candles: ChartCandle[] }
  | { status: "unavailable"; reason: string };

type NseChartRow = { time: number; open: number; high: number; low: number; close: number };
type NseChartResponse = { status?: boolean; data?: NseChartRow[] };

/** Daily OHLC for any NSE-published symbol — index or equity — via NSE's
 * own charting endpoint. Free, no broker account, and (unlike TradingView's
 * free embed) not gated by exchange data licensing: covers every NSE index
 * family name and every NSE-listed stock the same way. SENSEX is the one
 * exception — this endpoint resolves "SENSEX" to the wrong instrument
 * (values ~80 instead of ~80,000, confirmed by testing), so BSE symbols
 * stay on the TradingView/Dhan path instead. */
export async function getIndiaDailyCandles(
  symbol: string,
  kind: "equity" | "index",
  days = 180,
): Promise<CandleChartResult> {
  try {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    const response = (await nse.getEquityChartHistoricalData(
      symbol,
      { start, end },
      undefined,
      kind === "index" ? "Index" : "Equity",
      "D",
    )) as unknown as NseChartResponse;

    const rows = response?.data ?? [];
    if (rows.length === 0) {
      return { status: "unavailable", reason: `no historical data for ${symbol}` };
    }

    const candles: ChartCandle[] = rows
      .map((r) => ({
        time: new Date(r.time).toISOString().slice(0, 10),
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
      }))
      .sort((a, b) => a.time.localeCompare(b.time));

    return { status: "ok", candles };
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : "network error" };
  }
}
