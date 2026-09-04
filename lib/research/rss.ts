import "server-only";
import type { NewsArticle, NewsMarketTag, NewsResult } from "@/lib/research/types";

// Every URL here was fetched directly and confirmed to return a real RSS
// feed (HTTP 200, application/rss+xml body) before being hardcoded — feed
// URLs rot, so if one of these starts failing in isolation (others still
// return "ok"), it's the feed that moved, not this wrapper.
const FEEDS: { source: string; url: string; market: NewsMarketTag }[] = [
  { source: "CNBC - Top News", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", market: "US" },
  { source: "MarketWatch - Top Stories", url: "https://feeds.marketwatch.com/marketwatch/topstories/", market: "US" },
  { source: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex", market: "US" },
  { source: "LiveMint - Markets", url: "https://www.livemint.com/rss/markets", market: "INDIA" },
  { source: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", market: "CRYPTO" },
];

// A handful of sites (CNBC, Yahoo) block bare server-side fetches (403/429)
// without a browser-like User-Agent — confirmed by testing both with and
// without one.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Conservative — a wrong ticker chip is worse than none, so this only
// matches whole-word, case-sensitive tickers a headline is likely to spell
// out plainly, not every three-letter word in the dictionary.
const TICKER_PATTERNS: [RegExp, string][] = [
  [/\bAAPL\b|\bApple\b/, "AAPL"],
  [/\bMSFT\b|\bMicrosoft\b/, "MSFT"],
  [/\bGOOGL?\b|\bAlphabet\b/, "GOOGL"],
  [/\bAMZN\b|\bAmazon\b/, "AMZN"],
  [/\bTSLA\b|\bTesla\b/, "TSLA"],
  [/\bNVDA\b|\bNvidia\b/, "NVDA"],
  [/\bMETA\b/, "META"],
  [/\bJPM\b|\bJPMorgan\b/, "JPM"],
  [/\bINTC\b|\bIntel\b/, "INTC"],
  [/\bGME\b|\bGameStop\b/, "GME"],
  [/\bBTC\b|\bBitcoin\b/, "BTC"],
  [/\bETH\b|\bEthereum\b/, "ETH"],
  [/\bNIFTY\b/, "NIFTY"],
  [/\bSENSEX\b/, "SENSEX"],
];

function extractTickers(headline: string): string[] {
  const found = new Set<string>();
  for (const [pattern, ticker] of TICKER_PATTERNS) {
    if (pattern.test(headline)) found.add(ticker);
  }
  return Array.from(found);
}

function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

function extractTag(itemXml: string, tag: string): string | null {
  const match = itemXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeEntities(match[1]) : null;
}

/** Minimal regex-based RSS 2.0 <item> extractor — RSS's item shape is
 * simple and stable enough that pulling in a full XML parser dependency
 * isn't worth it for five feeds. */
function parseRssItems(xml: string, source: string, market: NewsMarketTag, isCustom: boolean): NewsArticle[] {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  return items
    .map((item): NewsArticle | null => {
      const headline = extractTag(item, "title");
      const link = extractTag(item, "link");
      if (!headline || !link) return null;

      const pubDate = extractTag(item, "pubDate");
      const publishedAt = pubDate && !Number.isNaN(Date.parse(pubDate)) ? new Date(pubDate).toISOString() : new Date().toISOString();
      const rawDescription = extractTag(item, "description") ?? "";
      const summary = stripHtml(rawDescription).slice(0, 240);

      return {
        id: link,
        headline: stripHtml(headline),
        summary,
        source,
        url: link.trim(),
        imageUrl: null,
        publishedAt,
        tickers: extractTickers(headline),
        sentiment: null,
        market,
        isCustom,
      };
    })
    .filter((a): a is NewsArticle => a !== null);
}

function normalizeTitle(headline: string): string {
  return headline.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Fetches every source feed in parallel, merges, dedupes by normalized
 * headline (the same story often runs on multiple wires), and sorts
 * newest-first. Never throws — a down/blocked feed is dropped silently and
 * the rest still render; only returns "unavailable" if every feed failed.
 */
export async function getAggregatedNews(
  marketFilter?: NewsMarketTag,
  customFeeds: { source: string; url: string }[] = [],
): Promise<NewsResult> {
  const baseFeeds = marketFilter ? FEEDS.filter((f) => f.market === marketFilter) : FEEDS;
  const feeds: { source: string; url: string; market: NewsMarketTag; isCustom: boolean }[] = [
    ...baseFeeds.map((f) => ({ ...f, isCustom: false })),
    ...customFeeds.map((f) => ({ ...f, market: "GLOBAL" as NewsMarketTag, isCustom: true })),
  ];

  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const response = await fetch(feed.url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml, text/xml" },
        // Was no-store, which made every dashboard/research view re-fetch
        // every feed before anything could render — the dominant cost on
        // the overview page. Headlines two minutes old are indistinguishable
        // from live here, and a cache miss still streams in behind Suspense.
        next: { revalidate: 120 },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const xml = await response.text();
      return parseRssItems(xml, feed.source, feed.market, feed.isCustom);
    }),
  );

  const articles: NewsArticle[] = [];
  const seenTitles = new Set<string>();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const article of result.value) {
      const key = normalizeTitle(article.headline);
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      articles.push(article);
    }
  }

  if (articles.length === 0) {
    return { status: "unavailable", reason: "every news feed is currently unreachable" };
  }

  articles.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  return { status: "ok", articles };
}
