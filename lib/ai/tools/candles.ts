import "server-only";
import { z } from "zod";
import type { ChartCandle } from "@/lib/market/india-chart";
import { fetchDailyCandles, type CandleKind, type CandleMarket } from "./candle-source";
import { TIME_RANGES, rangeToDays, ok, unavailable, type TimeRange, type ToolResult } from "./shared";
import { downsampleCandles } from "./indicator-math";

function normalizeRange(r?: string): TimeRange {
  if (!r) return "1y";
  const clean = r.toLowerCase().trim();
  if (TIME_RANGES.includes(clean as TimeRange)) return clean as TimeRange;
  if (clean.includes("5d") || clean.includes("5 day") || clean.includes("week")) return "5d";
  if (clean.includes("1m") || clean.includes("1 month") || clean.includes("month")) return "1m";
  if (clean.includes("3m") || clean.includes("3 month") || clean.includes("quarter")) return "3m";
  if (clean.includes("6m") || clean.includes("6 month") || clean.includes("half")) return "6m";
  if (clean.includes("ytd")) return "ytd";
  if (clean.includes("1y") || clean.includes("1 year") || clean.includes("year")) return "1y";
  if (clean.includes("2y") || clean.includes("2 year")) return "2y";
  if (clean.includes("3y") || clean.includes("3 year")) return "3y";
  if (clean.includes("5y") || clean.includes("5 year")) return "5y";
  if (clean.includes("10y") || clean.includes("10 year")) return "10y";
  if (clean.includes("max") || clean.includes("all")) return "max";
  return "1y";
}

export const getCandlesInputSchema = z
  .object({
    symbol: z.string().describe("Symbol ticker (e.g. RELIANCE.NS, AAPL, NIFTY50)"),
    kind: z.enum(["equity", "index"]).optional(),
    market: z.enum(["india", "us"]).optional(),
    range: z.string().optional().default("1y").describe("Time range (e.g. '5d', '1m', '3m', '6m', '1y', '5y')"),
    downsample: z.boolean().optional(),
  })
  .transform((input) => {
    let market: CandleMarket = input.market ?? "india";
    if (!input.market) {
      market =
        input.symbol.endsWith(".NS") ||
        input.symbol.endsWith(".BO") ||
        input.symbol.startsWith("NIFTY") ||
        input.symbol.startsWith("BANKNIFTY") ||
        input.symbol.startsWith("SENSEX")
          ? "india"
          : "us";
    }
    const kind: CandleKind =
      input.kind ??
      (input.symbol.startsWith("NIFTY") || input.symbol.startsWith("BANKNIFTY") || input.symbol.startsWith("SENSEX")
        ? "index"
        : "equity");
    const range = normalizeRange(input.range);
    return {
      symbol: input.symbol,
      kind,
      market,
      range,
      downsample: input.downsample,
    };
  });
export type GetCandlesInput = z.infer<typeof getCandlesInputSchema>;

export type GetCandlesOutput = {
  candles: ChartCandle[];
  count: number;
  seriesId: string;
  range: TimeRange;
  asOf: string;
};

/**
 * The series ID is a decodable pointer, not a lookup key into a server-side
 * cache — there's nowhere to cache it (serverless, no shared store between
 * this call and the client's later re-fetch). Encoding the params directly
 * lets /api/ai/candles rebuild the exact same request instead of needing a
 * hash-to-params table that would only ever have one writer and one reader.
 */
export type SeriesIdParams = { market: CandleMarket; kind: CandleKind; symbol: string; range: TimeRange };

function seriesIdFor(params: SeriesIdParams): string {
  return Buffer.from(JSON.stringify(params)).toString("base64url");
}

export function decodeSeriesId(seriesId: string): SeriesIdParams | null {
  try {
    const parsed = JSON.parse(Buffer.from(seriesId, "base64url").toString("utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.symbol !== "string" ||
      (parsed.kind !== "equity" && parsed.kind !== "index") ||
      (parsed.market !== "india" && parsed.market !== "us") ||
      !TIME_RANGES.includes(parsed.range)
    ) {
      return null;
    }
    return parsed as SeriesIdParams;
  } catch {
    return null;
  }
}

/**
 * Daily OHLC candles, downsampled to ≤60 points for the model by default —
 * see PLAN_AI_COPILOT.md §2.1 "Prices and charts": a raw multi-year series
 * is thousands of tokens the model will misread, so it gets the summary and
 * the client chart renderer re-fetches the full series via `seriesId`
 * (downsample: false) to draw everything.
 *
 * Routing: India *index* candles come from NSE's own chart endpoint (the
 * only source that recognizes NSE's bare index codes like "NIFTY50"); every
 * other case — India equities (Yahoo's .NS-suffixed symbols) and all US
 * symbols — goes through Yahoo, which is what lib/research/company.ts's
 * price chart already uses.
 */
export async function getCandles(input: GetCandlesInput): Promise<ToolResult<GetCandlesOutput>> {
  const days = rangeToDays(input.range);
  const asOf = new Date().toISOString();

  const result = await fetchDailyCandles(input.symbol, input.kind, input.market, days);

  if (result.status === "unavailable") return unavailable(result.reason);

  const maxPoints = input.downsample === false ? Number.POSITIVE_INFINITY : 60;
  const candles = input.downsample === false ? result.candles : downsampleCandles(result.candles, maxPoints);

  return ok({
    candles,
    count: result.candles.length,
    seriesId: seriesIdFor({ market: input.market, kind: input.kind, symbol: input.symbol, range: input.range }),
    range: input.range,
    asOf,
  });
}
