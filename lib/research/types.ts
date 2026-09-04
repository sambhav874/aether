export type NewsSentiment = "positive" | "negative" | "neutral";
export type NewsMarketTag = "INDIA" | "US" | "GLOBAL" | "CRYPTO";

export type NewsArticle = {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  imageUrl: string | null;
  publishedAt: string;
  tickers: string[];
  sentiment: NewsSentiment | null;
  /** Present for RSS-aggregated articles (known source → known market) and
   * for Finnhub category news (mapped from the requested category). Absent
   * for ticker-search results, which aren't tied to one market. */
  market?: NewsMarketTag;
  /** True for articles pulled from a user's own custom RSS feed rather than
   * a built-in source — lets UI surface/filter/guarantee visibility for them. */
  isCustom?: boolean;
};

export type NewsResult =
  | { status: "ok"; articles: NewsArticle[] }
  | { status: "unavailable"; reason: string };
