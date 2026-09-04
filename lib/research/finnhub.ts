import "server-only";
import type { NewsArticle, NewsMarketTag, NewsResult } from "@/lib/research/types";
import { getTickerNewsFromKeiro } from "@/lib/research/keiro";
import { getAggregatedNews } from "@/lib/research/rss";

const BASE_URL = "https://finnhub.io/api/v1";

type FinnhubNewsItem = {
  id: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  image: string;
  datetime: number;
  related: string;
  category: string;
};

function getToken(): string | null {
  return process.env.FINNHUB_API_KEY ?? null;
}

function toArticle(item: FinnhubNewsItem): NewsArticle {
  return {
    id: String(item.id),
    headline: item.headline,
    summary: item.summary,
    source: item.source,
    url: item.url,
    imageUrl: item.image || null,
    publishedAt: new Date(item.datetime * 1000).toISOString(),
    tickers: item.related ? item.related.split(",").map((t) => t.trim()).filter(Boolean) : [],
    // Finnhub's sentiment scoring is gated to paid plans — free /news and
    // /company-news never carry it, so this stays null rather than guessing.
    sentiment: null,
  };
}

/**
 * General market news — uses Finnhub when configured, otherwise falls back
 * to the RSS aggregator. Never throws.
 */
export async function getMarketNews(category: "general" | "forex" | "crypto" | "merger" = "general"): Promise<NewsResult> {
  const token = getToken();
  if (token) {
    try {
      const url = `${BASE_URL}/news?category=${category}&token=${token}`;
      const response = await fetch(url, { next: { revalidate: 120 } });
      if (response.ok) {
        const data: unknown = await response.json();
        if (Array.isArray(data)) {
          const articles = (data as FinnhubNewsItem[]).filter((d) => d.headline && d.url).map(toArticle);
          if (articles.length > 0) {
            return { status: "ok", articles };
          }
        }
      }
    } catch {
      // Degrades to RSS aggregator fallback below
    }
  }

  const marketCategoryMap: Record<string, NewsMarketTag> = {
    general: "GLOBAL",
    forex: "GLOBAL",
    crypto: "CRYPTO",
    merger: "US",
  };
  return getAggregatedNews(marketCategoryMap[category] ?? "GLOBAL");
}

/**
 * Per-symbol news — uses Finnhub if configured, otherwise falls back
 * seamlessly to Keiro Labs search.
 */
export async function getTickerNews(symbol: string): Promise<NewsResult> {
  const token = getToken();
  if (token) {
    try {
      const to = new Date();
      const from = new Date(to.getTime() - 14 * 24 * 60 * 60 * 1000);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const url = `${BASE_URL}/company-news?symbol=${encodeURIComponent(symbol)}&from=${fmt(from)}&to=${fmt(to)}&token=${token}`;
      const response = await fetch(url, { next: { revalidate: 120 } });
      if (response.ok) {
        const data: unknown = await response.json();
        if (Array.isArray(data)) {
          const articles = (data as FinnhubNewsItem[])
            .filter((d) => d.headline && d.url)
            .map((d) => ({ ...toArticle(d), tickers: [symbol.toUpperCase()] }));
          if (articles.length > 0) {
            return { status: "ok", articles };
          }
        }
      }
    } catch {
      // Degrades to Keiro fallback below
    }
  }

  // If Finnhub key is not set or failed/returned empty, search via Keiro Labs
  return getTickerNewsFromKeiro(symbol);
}
