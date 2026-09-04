import "server-only";
import { nse } from "@/lib/options/nse-provider";
import type { SymbolQuoteResult } from "@/lib/market/types";

/** Individual NSE-listed equity quotes (Ola Electric, Adani Enterprises,
 * etc.) via the same free NSE session already used for indices/options —
 * Finnhub's search finds these (symbol suffixed ".NS") but its /quote
 * endpoint 403s on them (real-time non-US equity data needs a paid plan,
 * confirmed by calling it directly), so `.NS` symbols are routed here
 * instead. */
export async function getIndiaSymbolQuote(symbol: string, name: string): Promise<SymbolQuoteResult> {
  const nseSymbol = symbol.replace(/\.NS$/i, "");
  try {
    const details = await nse.getEquityDetails(nseSymbol);
    const price = details?.priceInfo;
    if (!price || typeof price.lastPrice !== "number") {
      return { status: "unavailable", reason: `no data for ${symbol}` };
    }
    return {
      status: "ok",
      row: { symbol, name, last: price.lastPrice, change: price.change, changePct: price.pChange },
    };
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : "network error" };
  }
}
