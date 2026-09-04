import "server-only";
import { nse } from "@/lib/options/nse-provider";
import type { WatchlistRow, WatchlistResult } from "@/lib/market/types";

export type { WatchlistRow, WatchlistResult, WatchlistTab } from "@/lib/market/types";

// The published `AllIndicesData` type declares `indexName`/`change`/
// `percChange`/no `key`, but the live endpoint actually returns
// `index`/`variation`/`percentChange`/`key` — confirmed against a real
// response, not the (stale) .d.ts.
type NseIndexRow = { key: string; index: string; last: number; variation: number; percentChange: number };

function toSymbol(indexName: string): string {
  return indexName.replace(/\s+/g, "");
}

// TradingView's NSE index tickers don't follow NSE's own index-family
// naming — e.g. "NIFTY 100" is NSE's real name but not a resolvable
// TradingView symbol (confirmed by testing it in the chart: "symbol not
// found"). Only these two are verified working tickers (reused from the
// tradingview-market-overview embed this replaced, which already used
// them successfully) — everything else gets chartSymbol: null rather than
// a guessed ticker that breaks the chart.
const VERIFIED_CHART_SYMBOLS: Record<string, string> = {
  "NIFTY 50": "NSE:NIFTY",
  "NIFTY BANK": "NSE:BANKNIFTY",
};

/** Live NSE index quotes (no broker account required) for the app's own
 * themed watchlist — replaces the TradingView market-overview embed. Pulls
 * every index NSE publishes (all NSE-listed, so tagged "NSE" — SENSEX is
 * appended separately as "BSE" by the caller), grouped by exchange rather
 * than NSE's own six-way index-family split. Commodity-tracking indices are
 * dropped — this is an equity-index feed, not a commodities feed. */
export async function getWatchlistIndices(): Promise<WatchlistResult> {
  try {
    const response = await nse.getAllIndices();
    const data = ((response as unknown as { data: NseIndexRow[] })?.data) ?? [];
    if (data.length === 0) {
      return { status: "unavailable", reason: "NSE returned no index data" };
    }

    const rows: WatchlistRow[] = data
      .filter((row) => !/COMMODIT/i.test(row.index))
      .map(
        (row): WatchlistRow => ({
          symbol: toSymbol(row.index),
          name: row.index,
          tab: "NSE",
          last: row.last,
          change: row.variation,
          changePct: row.percentChange,
          chartSymbol: VERIFIED_CHART_SYMBOLS[row.index] ?? null,
        }),
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    if (rows.length === 0) {
      return { status: "unavailable", reason: "NSE response had no usable rows" };
    }

    return { status: "ok", rows };
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : "network error" };
  }
}
