import "server-only";
import type { NewsArticle, NewsResult } from "@/lib/research/types";

function getConfig(): { apiKey: string; baseUrl: string } | null {
  const apiKey = process.env.KEIRO_API_KEY;
  const baseUrl = process.env.KEIRO_API_BASE_URL;
  if (!apiKey || !baseUrl) return null;
  return { apiKey, baseUrl: baseUrl.replace(/\/$/, "") };
}

function resolveSearchUrl(baseUrl: string): string {
  const clean = baseUrl.replace(/\/$/, "");
  if (clean.endsWith("/search") || clean.endsWith("/search/fast")) {
    return clean;
  }
  return `${clean}/search`;
}

type RawKeiroSearchResponse = {
  results?: {
    title?: string;
    url?: string;
    snippet?: string;
    content?: string;
    published_at?: string;
    source?: string;
  }[];
};

/**
 * Per-symbol news search via Keiro Labs.
 * Queries Keiro's /search endpoint for the latest ticker news and converts the hits into NewsArticle objects.
 */
export async function getTickerNewsFromKeiro(symbol: string): Promise<NewsResult> {
  const config = getConfig();
  if (!config) {
    return {
      status: "unavailable",
      reason: "Neither FINNHUB_API_KEY nor KEIRO_API_KEY (with KEIRO_API_BASE_URL) is configured.",
    };
  }

  try {
    const url = resolveSearchUrl(config.baseUrl);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        query: `${symbol} stock news latest headlines`,
        recency: "month",
        limit: 15,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { status: "unavailable", reason: `Keiro returned HTTP ${response.status}` };
    }

    const data = (await response.json()) as RawKeiroSearchResponse;
    const rawResults = data.results ?? [];

    const articles: NewsArticle[] = rawResults
      .filter((r) => r.title && r.url)
      .map((r, idx) => {
        let sourceName = r.source;
        if (!sourceName && r.url) {
          try {
            sourceName = new URL(r.url).hostname.replace(/^www\./, "");
          } catch {
            sourceName = "Web";
          }
        }

        return {
          id: `keiro-${symbol.toUpperCase()}-${idx}-${Date.now()}`,
          headline: r.title ?? "",
          summary: (r.snippet ?? r.content ?? "").slice(0, 500),
          source: sourceName || "Web",
          url: r.url ?? "",
          imageUrl: null,
          publishedAt: r.published_at ? new Date(r.published_at).toISOString() : new Date().toISOString(),
          tickers: [symbol.toUpperCase()],
          sentiment: null,
        };
      });

    if (articles.length === 0) {
      return { status: "unavailable", reason: `No recent news found for ${symbol}` };
    }

    return { status: "ok", articles };
  } catch (error) {
    return {
      status: "unavailable",
      reason: error instanceof Error ? error.message : "network error connecting to Keiro",
    };
  }
}
