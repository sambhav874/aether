import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NewsArticle } from "@/lib/research/types";

vi.mock("@/lib/research/finnhub", () => ({ getTickerNews: vi.fn() }));
vi.mock("@/lib/research/rss", () => ({ getAggregatedNews: vi.fn() }));
vi.mock("./user-rss", () => ({ getUserCustomFeeds: vi.fn() }));

import { getTickerNews } from "@/lib/research/finnhub";
import { getAggregatedNews } from "@/lib/research/rss";
import { getUserCustomFeeds } from "./user-rss";
import { searchNews } from "./news";

const mockedTickerNews = vi.mocked(getTickerNews);
const mockedAggregated = vi.mocked(getAggregatedNews);
const mockedCustomFeeds = vi.mocked(getUserCustomFeeds);

function article(overrides: Partial<NewsArticle>): NewsArticle {
  return {
    id: "1",
    headline: "Some headline",
    summary: "Some summary",
    source: "Test Wire",
    url: "https://example.com/a",
    imageUrl: null,
    publishedAt: new Date().toISOString(),
    tickers: [],
    sentiment: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockedTickerNews.mockReset();
  mockedAggregated.mockReset();
  mockedCustomFeeds.mockReset();
});

describe("searchNews", () => {
  it("routes to per-ticker Finnhub news when a symbol is given", async () => {
    mockedTickerNews.mockResolvedValue({ status: "ok", articles: [article({ headline: "TCS wins big deal" })] });

    const result = await searchNews({ symbol: "TCS", since: "24h", limit: 15 });
    expect(result.status).toBe("ok");
    expect(mockedTickerNews).toHaveBeenCalledWith("TCS");
    expect(mockedAggregated).not.toHaveBeenCalled();
  });

  it("routes to aggregated RSS when no symbol is given, merging the user's own feeds when userId is provided", async () => {
    mockedCustomFeeds.mockResolvedValue([{ source: "My Feed", url: "https://example.com/feed.xml" }]);
    mockedAggregated.mockResolvedValue({ status: "ok", articles: [article({ headline: "Market wrap" })] });

    await searchNews({ market: "INDIA", since: "24h", limit: 15 }, { userId: "user_1" });
    expect(mockedCustomFeeds).toHaveBeenCalledWith("user_1");
    expect(mockedAggregated).toHaveBeenCalledWith("INDIA", [{ source: "My Feed", url: "https://example.com/feed.xml" }]);
  });

  it("does not fetch personal feeds when no userId is in context", async () => {
    mockedAggregated.mockResolvedValue({ status: "ok", articles: [] });

    await searchNews({ since: "24h", limit: 15 });
    expect(mockedCustomFeeds).not.toHaveBeenCalled();
    expect(mockedAggregated).toHaveBeenCalledWith(undefined, []);
  });

  it("filters out articles older than the `since` window", async () => {
    const fresh = article({ headline: "fresh", publishedAt: new Date().toISOString() });
    const stale = article({ headline: "stale", publishedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() });
    mockedAggregated.mockResolvedValue({ status: "ok", articles: [fresh, stale] });

    const result = await searchNews({ since: "24h", limit: 15 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.articles.map((a) => a.headline)).toEqual(["fresh"]);
  });

  it("filters by `query` as a case-insensitive substring over headline/summary", async () => {
    mockedAggregated.mockResolvedValue({
      status: "ok",
      articles: [article({ headline: "RBI holds rates steady" }), article({ headline: "Unrelated story", summary: "mentions rbi policy in passing" }), article({ headline: "Nothing to do with it" })],
    });

    const result = await searchNews({ query: "RBI", since: "7d", limit: 15 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.articles).toHaveLength(2);
  });

  it("never leaks article bodies — only headline/source/publishedAt/url/sentiment reach the caller", async () => {
    mockedAggregated.mockResolvedValue({ status: "ok", articles: [article({ headline: "x", summary: "this body text must not appear in the tool output" })] });

    const result = await searchNews({ since: "24h", limit: 15 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(Object.keys(result.data.articles[0]).sort()).toEqual(["headline", "publishedAt", "sentiment", "source", "url"]);
  });

  it("propagates unavailable without inventing an empty-but-ok result", async () => {
    mockedAggregated.mockResolvedValue({ status: "unavailable", reason: "every news feed is currently unreachable" });

    const result = await searchNews({ since: "24h", limit: 15 });
    expect(result).toEqual({ status: "unavailable", reason: "every news feed is currently unreachable" });
  });
});
