export type MarketGroup = "india" | "us" | "forex";

export const MARKET_GROUP_LABELS: Record<MarketGroup, string> = {
  india: "India",
  us: "US",
  forex: "Forex",
};

export type WatchlistTab = "NSE" | "BSE";

export const WATCHLIST_TAB_LABELS: Record<WatchlistTab, string> = {
  NSE: "NSE",
  BSE: "BSE",
};

export type WatchlistRow = {
  symbol: string;
  name: string;
  tab: WatchlistTab;
  last: number | null;
  change: number | null;
  changePct: number | null;
  // TradingView ticker to chart on click — null when we can't confidently
  // map this row's name to a real TradingView symbol (most of NSE's ~135
  // index-family names don't follow a guessable pattern; see watchlist.ts).
  chartSymbol: string | null;
};

export type WatchlistResult =
  | { status: "ok"; rows: WatchlistRow[] }
  | { status: "unavailable"; reason: string };

// Flat quote row for markets with no sub-categories (forex).
export type QuoteRow = {
  symbol: string;
  name: string;
  last: number | null;
  change: number | null;
  changePct: number | null;
};

export type QuoteListResult =
  | { status: "ok"; rows: QuoteRow[] }
  | { status: "unavailable"; reason: string };

export type UsCategory = "indices" | "commodities" | "stocks";

export const US_CATEGORY_LABELS: Record<UsCategory, string> = {
  indices: "Indices",
  commodities: "Commodities",
  stocks: "Stocks",
};

export type UsRow = QuoteRow & { category: UsCategory };

export type UsListResult =
  | { status: "ok"; rows: UsRow[] }
  | { status: "unavailable"; reason: string };

export type SearchHit = { symbol: string; name: string; type: string };

export type SearchResult =
  | { status: "ok"; hits: SearchHit[] }
  | { status: "unavailable"; reason: string };

export type SymbolQuoteResult =
  | { status: "ok"; row: QuoteRow }
  | { status: "unavailable"; reason: string };
