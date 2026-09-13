import "server-only";
import type { SearchResult, SymbolQuoteResult, UsCategory, UsListResult, UsRow } from "@/lib/market/types";
import { unstable_cache } from "next/cache";
import { fetchWithTimeout } from "@/lib/http";

const BASE_URL = "https://finnhub.io/api/v1";

// Raw index symbols (^GSPC etc.) need Finnhub's paid market-data add-on
// ("Market data subscription required for CFD indices") — confirmed by
// calling it directly with this project's key. The SPDR/Invesco/iShares
// ETFs that track the same indices are plain common stock and work on the
// free /quote endpoint, so they stand in as live proxies.
const US_INDICES: { symbol: string; name: string }[] = [
  { symbol: "SPY", name: "S&P 500 (SPY)" },
  { symbol: "QQQ", name: "Nasdaq 100 (QQQ)" },
  { symbol: "DIA", name: "Dow Jones Industrial (DIA)" },
  { symbol: "IWM", name: "Russell 2000 (IWM)" },
];

// Same ETF-proxy trick for commodities — spot gold/oil/etc. aren't quotable
// on the free tier, but the ETFs that track them trade as ordinary common
// stock and are (confirmed against this project's key).
const US_COMMODITIES: { symbol: string; name: string }[] = [
  { symbol: "GLD", name: "Gold (GLD)" },
  { symbol: "SLV", name: "Silver (SLV)" },
  { symbol: "USO", name: "Crude Oil (USO)" },
  { symbol: "UNG", name: "Natural Gas (UNG)" },
  { symbol: "DBA", name: "Agriculture (DBA)" },
];

const US_STOCKS: { symbol: string; name: string }[] = [
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "NVDA", name: "Nvidia" },
  { symbol: "META", name: "Meta Platforms" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "JPM", name: "JPMorgan Chase" },
  { symbol: "V", name: "Visa" },
  { symbol: "WMT", name: "Walmart" },
  { symbol: "DIS", name: "Disney" },
  { symbol: "NFLX", name: "Netflix" },
];

function getToken(): string | null {
  return process.env.FINNHUB_API_KEY ?? null;
}

type FinnhubQuote = { c: number; d: number | null; dp: number | null; pc: number };

// Finnhub's free tier is the real constraint here (60 req/min, and an
// even tighter undocumented per-second burst limit — confirmed by testing
// directly). Rather than chase another rate-limited free provider, quotes
// are cached in-process for a short window: the client already polls every
// 30s, so a 20s server-side cache means concurrent tabs/users and rapid
// favourite adds reuse one real Finnhub call instead of one each. In-flight
// requests for the same symbol are also deduped so a burst of calls for the
// same ticker (e.g. watchlist load + a favourite refresh landing together)
// only hits the network once.
const QUOTE_TTL_MS = 20_000;
const quoteCache = new Map<string, { data: FinnhubQuote | null; expires: number }>();
const inFlight = new Map<string, Promise<FinnhubQuote | null>>();

async function fetchQuote(symbol: string, token: string): Promise<FinnhubQuote | null> {
  const cached = quoteCache.get(symbol);
  if (cached && cached.expires > Date.now()) return cached.data;

  const pending = inFlight.get(symbol);
  if (pending) return pending;

  const request = (async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as FinnhubQuote;
    // Finnhub returns all-zero/null fields (HTTP 200) for a symbol it has no
    // data for, rather than a 404 — that's the "not found" signal here.
    return data.c === 0 && data.pc === 0 ? null : data;
  })();

  inFlight.set(symbol, request);
  try {
    const data = await request;
    quoteCache.set(symbol, { data, expires: Date.now() + QUOTE_TTL_MS });
    return data;
  } finally {
    inFlight.delete(symbol);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Free-tier Finnhub trips a per-second burst limit well before the 60/min
 * quota (confirmed: firing ~20 /quote calls via Promise.all got several back
 * as 429 "Too many requests"), so the watchlist's full symbol list is
 * fetched in small staggered batches instead of all at once. */
async function mapWithLimit<T, R>(items: T[], limit: number, delayMs: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    if (i + limit < items.length) await sleep(delayMs);
  }
  return results;
}

const CATEGORY_LISTS: { category: UsCategory; symbols: { symbol: string; name: string }[] }[] = [
  { category: "indices", symbols: US_INDICES },
  { category: "commodities", symbols: US_COMMODITIES },
  { category: "stocks", symbols: US_STOCKS },
];

/**
 * A fixed symbol list fanned out over Finnhub's free tier, which is rate
 * limited — uncached, two people opening the dashboard at once could exhaust
 * the quota between them. 60s keeps quotes live enough for a watchlist.
 */
export const getUsWatchlist = unstable_cache(
  _getUsWatchlist,
  ["us-watchlist"],
  { revalidate: 60, tags: ["market-quotes"] },
);

async function _getUsWatchlist(): Promise<UsListResult> {
  const token = getToken();
  if (!token) return { status: "unavailable", reason: "FINNHUB_API_KEY is not set" };

  try {
    const flat = CATEGORY_LISTS.flatMap(({ category, symbols }) => symbols.map((s) => ({ ...s, category })));
    const results = await mapWithLimit(flat, 5, 250, async (proxy): Promise<UsRow> => {
      const quote = await fetchQuote(proxy.symbol, token);
      return {
        symbol: proxy.symbol,
        name: proxy.name,
        category: proxy.category,
        last: quote?.c ?? null,
        change: quote?.d ?? null,
        changePct: quote?.dp ?? null,
      };
    });
    if (results.every((r) => r.last === null)) {
      return { status: "unavailable", reason: "Finnhub returned no data for any US symbol" };
    }
    return { status: "ok", rows: results };
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : "network error" };
  }
}

const SEARCH_TTL_MS = 60_000;
const searchCache = new Map<string, { hits: { symbol: string; name: string; type: string }[]; expires: number }>();

export async function searchSymbols(query: string): Promise<SearchResult> {
  const token = getToken();
  if (!token) return { status: "unavailable", reason: "FINNHUB_API_KEY is not set" };
  const key = query.trim().toLowerCase();
  if (!key) return { status: "ok", hits: [] };

  const cached = searchCache.get(key);
  if (cached && cached.expires > Date.now()) return { status: "ok", hits: cached.hits };

  try {
    const response = await fetchWithTimeout(`${BASE_URL}/search?q=${encodeURIComponent(key)}&token=${token}`, {
      cache: "no-store",
    });
    if (!response.ok) return { status: "unavailable", reason: `Finnhub returned HTTP ${response.status}` };
    const data = (await response.json()) as { result?: { symbol: string; description: string; type: string }[] };
    const hits = (data.result ?? []).slice(0, 10).map((r) => ({ symbol: r.symbol, name: r.description, type: r.type }));
    searchCache.set(key, { hits, expires: Date.now() + SEARCH_TTL_MS });
    return { status: "ok", hits };
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : "network error" };
  }
}

export async function getSymbolQuote(symbol: string, name: string): Promise<SymbolQuoteResult> {
  const token = getToken();
  if (!token) return { status: "unavailable", reason: "FINNHUB_API_KEY is not set" };

  try {
    const quote = await fetchQuote(symbol, token);
    if (!quote) return { status: "unavailable", reason: `no data for ${symbol}` };
    return {
      status: "ok",
      row: { symbol, name, last: quote.c, change: quote.d, changePct: quote.dp },
    };
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : "network error" };
  }
}
