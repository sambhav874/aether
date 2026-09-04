import "server-only";
import { z } from "zod";
import { getWatchlistIndices } from "@/lib/market/watchlist";
import { getUsWatchlist } from "@/lib/market/quotes-us";
import { getForexRates } from "@/lib/market/quotes-forex";
import { getCryptoHeatmap } from "@/lib/heatmap/coingecko";
import { getYahooHeatmap, type YahooHeatmapCategory } from "@/lib/heatmap/yahoo";
import { ok, unavailable, type ToolResult } from "./shared";

export const getMarketOverviewInputSchema = z.object({
  scope: z.enum(["india", "us", "forex", "crypto"]),
});
export type GetMarketOverviewInput = z.infer<typeof getMarketOverviewInputSchema>;

export type MarketMover = { symbol: string; name: string; last: number | null; changePct: number | null };

export type MarketOverview = {
  scope: GetMarketOverviewInput["scope"];
  indices: MarketMover[];
  // Share of tracked instruments that are up vs down right now — a coarse
  // proxy over the fixed watchlist this scope covers, not exchange-wide
  // advance/decline data (none of the wrapped sources publish that).
  breadth: { up: number; down: number; flat: number; of: number } | null;
  topGainers: MarketMover[];
  topLosers: MarketMover[];
  asOf: string;
};

function movers(rows: MarketMover[], limit = 5): { gainers: MarketMover[]; losers: MarketMover[] } {
  const withChange = rows.filter((r) => r.changePct !== null);
  const sorted = [...withChange].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  return { gainers: sorted.slice(0, limit), losers: sorted.slice(-limit).reverse() };
}

function breadthOf(rows: MarketMover[]): MarketOverview["breadth"] {
  const withChange = rows.filter((r) => r.changePct !== null);
  if (withChange.length === 0) return null;
  const up = withChange.filter((r) => (r.changePct ?? 0) > 0).length;
  const down = withChange.filter((r) => (r.changePct ?? 0) < 0).length;
  return { up, down, flat: withChange.length - up - down, of: withChange.length };
}

/**
 * A scope-wide snapshot — indices, breadth, top movers — built from the
 * same free sources the dashboard's own watchlists use (lib/market/*,
 * lib/heatmap/coingecko.ts). "Indices" is empty for forex/crypto, which
 * have no index concept in the sources this wraps; movers there are the
 * pairs/coins themselves.
 */
export async function getMarketOverview(input: GetMarketOverviewInput): Promise<ToolResult<MarketOverview>> {
  const asOf = new Date().toISOString();

  if (input.scope === "india") {
    const result = await getWatchlistIndices();
    if (result.status === "unavailable") return unavailable(result.reason);
    const rows: MarketMover[] = result.rows.map((r) => ({ symbol: r.symbol, name: r.name, last: r.last, changePct: r.changePct }));
    const { gainers, losers } = movers(rows);
    return ok({ scope: "india", indices: rows, breadth: breadthOf(rows), topGainers: gainers, topLosers: losers, asOf });
  }

  if (input.scope === "us") {
    const result = await getUsWatchlist();
    if (result.status === "unavailable") return unavailable(result.reason);
    const rows: MarketMover[] = result.rows.map((r) => ({ symbol: r.symbol, name: r.name, last: r.last, changePct: r.changePct }));
    const indices = rows.filter((_, i) => result.rows[i].category === "indices");
    const { gainers, losers } = movers(rows);
    return ok({ scope: "us", indices, breadth: breadthOf(rows), topGainers: gainers, topLosers: losers, asOf });
  }

  if (input.scope === "forex") {
    const result = await getForexRates();
    if (result.status === "unavailable") return unavailable(result.reason);
    const rows: MarketMover[] = result.rows.map((r) => ({ symbol: r.symbol, name: r.name, last: r.last, changePct: r.changePct }));
    const { gainers, losers } = movers(rows);
    return ok({ scope: "forex", indices: [], breadth: breadthOf(rows), topGainers: gainers, topLosers: losers, asOf });
  }

  const result = await getCryptoHeatmap();
  if (result.status === "unavailable") return unavailable(result.reason);
  const rows: MarketMover[] = result.entries.map((e) => ({ symbol: e.symbol, name: e.name, last: e.price, changePct: e.changePct24h }));
  const { gainers, losers } = movers(rows);
  return ok({ scope: "crypto", indices: [], breadth: breadthOf(rows), topGainers: gainers, topLosers: losers, asOf });
}

// --- get_sector_heatmap -------------------------------------------------

export const YAHOO_HEATMAP_CATEGORIES = ["us_equity", "india_fno", "india_equity", "india_broad", "commodities", "forex"] as const satisfies readonly YahooHeatmapCategory[];

export const getSectorHeatmapInputSchema = z.object({
  category: z.enum(YAHOO_HEATMAP_CATEGORIES),
});
export type GetSectorHeatmapInput = z.infer<typeof getSectorHeatmapInputSchema>;

export async function getSectorHeatmap(input: GetSectorHeatmapInput) {
  const result = await getYahooHeatmap(input.category);
  if (result.status === "unavailable") return unavailable(result.reason);
  return ok({ category: input.category, entries: result.entries, asOf: new Date().toISOString() });
}
