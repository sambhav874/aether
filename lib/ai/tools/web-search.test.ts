import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { webSearch, webResearch } from "./web-search";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  delete process.env.KEIRO_API_KEY;
  delete process.env.KEIRO_API_BASE_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("webSearch", () => {
  it("is unavailable when KEIRO_API_KEY/KEIRO_API_BASE_URL aren't set — never calls fetch with a guessed host", async () => {
    const result = await webSearch({ query: "adani group news", recency: "any", limit: 8 });
    expect(result.status).toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a Bearer-auth POST to the configured base URL + /search", async () => {
    process.env.KEIRO_API_KEY = "test-key";
    process.env.KEIRO_API_BASE_URL = "https://api.example.test";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });

    await webSearch({ query: "rbi policy", recency: "week", limit: 5 });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ query: "rbi policy", recency: "week", domains: undefined, limit: 5 });
  });

  it("strips a trailing slash on the configured base URL", async () => {
    process.env.KEIRO_API_KEY = "test-key";
    process.env.KEIRO_API_BASE_URL = "https://api.example.test/";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });

    await webSearch({ query: "x", recency: "any", limit: 5 });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.test/search");
  });

  it("maps results and truncates snippets to 500 chars", async () => {
    process.env.KEIRO_API_KEY = "test-key";
    process.env.KEIRO_API_BASE_URL = "https://api.example.test";
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ title: "RBI holds rates", url: "https://news.test/a", snippet: "x".repeat(600), published_at: "2026-08-01", source: "News Test" }] }),
    });

    const result = await webSearch({ query: "rbi", recency: "any", limit: 5 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.results[0]).toEqual({ title: "RBI holds rates", url: "https://news.test/a", snippet: "x".repeat(500), publishedAt: "2026-08-01", source: "News Test" });
  });

  it("derives source from the URL hostname when the API doesn't provide one", async () => {
    process.env.KEIRO_API_KEY = "test-key";
    process.env.KEIRO_API_BASE_URL = "https://api.example.test";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [{ title: "t", url: "https://www.moneycontrol.com/article", snippet: "s" }] }) });

    const result = await webSearch({ query: "x", recency: "any", limit: 5 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.results[0].source).toBe("www.moneycontrol.com");
  });

  it("is unavailable (not thrown) on a non-2xx response", async () => {
    process.env.KEIRO_API_KEY = "test-key";
    process.env.KEIRO_API_BASE_URL = "https://api.example.test";
    fetchMock.mockResolvedValue({ ok: false, status: 401 });

    const result = await webSearch({ query: "x", recency: "any", limit: 5 });
    expect(result.status).toBe("unavailable");
  });

  it("is unavailable (not thrown) on a network error", async () => {
    process.env.KEIRO_API_KEY = "test-key";
    process.env.KEIRO_API_BASE_URL = "https://api.example.test";
    fetchMock.mockRejectedValue(new Error("fetch failed"));

    const result = await webSearch({ query: "x", recency: "any", limit: 5 });
    expect(result.status).toBe("unavailable");
  });
});

describe("webResearch", () => {
  it("is unavailable without config", async () => {
    const result = await webResearch({ query: "what happened to adani this week", maxSources: 6 });
    expect(result.status).toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps the synthesized answer and citations, truncating quotes to 300 chars", async () => {
    process.env.KEIRO_API_KEY = "test-key";
    process.env.KEIRO_API_BASE_URL = "https://api.example.test";
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ answer: "Adani shares rose after...", citations: [{ title: "Source A", url: "https://a.test", quote: "y".repeat(400) }] }),
    });

    const result = await webResearch({ query: "adani this week", maxSources: 6 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.answer).toBe("Adani shares rose after...");
    expect(result.data.citations[0].quote).toBe("y".repeat(300));
  });

  it("is unavailable when the API returns no answer, rather than an empty ok result", async () => {
    process.env.KEIRO_API_KEY = "test-key";
    process.env.KEIRO_API_BASE_URL = "https://api.example.test";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ citations: [] }) });

    const result = await webResearch({ query: "x", maxSources: 6 });
    expect(result.status).toBe("unavailable");
  });
});
