import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTickerNewsFromKeiro } from "./keiro";

describe("getTickerNewsFromKeiro", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it("returns unavailable when KEIRO_API_KEY or KEIRO_API_BASE_URL is missing", async () => {
    delete process.env.KEIRO_API_KEY;
    delete process.env.KEIRO_API_BASE_URL;

    const res = await getTickerNewsFromKeiro("AAPL");
    expect(res.status).toBe("unavailable");
    if (res.status === "unavailable") {
      expect(res.reason).toContain("Neither FINNHUB_API_KEY nor KEIRO_API_KEY");
    }
  });

  it("fetches and formats ticker news when Keiro returns results", async () => {
    process.env.KEIRO_API_KEY = "test_key";
    process.env.KEIRO_API_BASE_URL = "https://api.keiro.test";

    const mockResponse = {
      results: [
        {
          title: "Apple Reports Strong Q3 Earnings",
          url: "https://bloomberg.com/news/apple-q3",
          snippet: "Apple revenue grew 10% year over year...",
          published_at: "2026-08-18T12:00:00Z",
          source: "Bloomberg",
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as unknown as Response);

    const res = await getTickerNewsFromKeiro("AAPL");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.keiro.test/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test_key",
        }),
      })
    );

    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect(res.articles).toHaveLength(1);
      expect(res.articles[0].headline).toBe("Apple Reports Strong Q3 Earnings");
      expect(res.articles[0].source).toBe("Bloomberg");
      expect(res.articles[0].tickers).toEqual(["AAPL"]);
    }
  });
});
