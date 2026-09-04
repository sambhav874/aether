import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/market/watchlist", () => ({ getWatchlistIndices: vi.fn() }));
vi.mock("@/lib/market/quotes-us", () => ({ getUsWatchlist: vi.fn() }));
vi.mock("@/lib/market/quotes-forex", () => ({ getForexRates: vi.fn() }));
vi.mock("@/lib/heatmap/coingecko", () => ({ getCryptoHeatmap: vi.fn() }));
vi.mock("@/lib/heatmap/yahoo", () => ({ getYahooHeatmap: vi.fn() }));

import { getWatchlistIndices } from "@/lib/market/watchlist";
import { getUsWatchlist } from "@/lib/market/quotes-us";
import { getForexRates } from "@/lib/market/quotes-forex";
import { getCryptoHeatmap } from "@/lib/heatmap/coingecko";
import { getYahooHeatmap } from "@/lib/heatmap/yahoo";
import { getMarketOverview, getSectorHeatmap } from "./market";

const mockedIndices = vi.mocked(getWatchlistIndices);
const mockedUs = vi.mocked(getUsWatchlist);
const mockedForex = vi.mocked(getForexRates);
const mockedCrypto = vi.mocked(getCryptoHeatmap);
const mockedHeatmap = vi.mocked(getYahooHeatmap);

beforeEach(() => {
  mockedIndices.mockReset();
  mockedUs.mockReset();
  mockedForex.mockReset();
  mockedCrypto.mockReset();
  mockedHeatmap.mockReset();
});

describe("getMarketOverview", () => {
  it("computes top gainers/losers and breadth for india from the index watchlist", async () => {
    mockedIndices.mockResolvedValue({
      status: "ok",
      rows: [
        { symbol: "NIFTY50", name: "Nifty 50", tab: "NSE", last: 24000, change: 100, changePct: 0.5, chartSymbol: null },
        { symbol: "NIFTYBANK", name: "Nifty Bank", tab: "NSE", last: 52000, change: -200, changePct: -0.4, chartSymbol: null },
        { symbol: "FLAT", name: "Flat Index", tab: "NSE", last: 100, change: 0, changePct: 0, chartSymbol: null },
      ],
    });

    const result = await getMarketOverview({ scope: "india" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.data.topGainers[0].symbol).toBe("NIFTY50");
    expect(result.data.topLosers[0].symbol).toBe("NIFTYBANK");
    expect(result.data.breadth).toEqual({ up: 1, down: 1, flat: 1, of: 3 });
    expect(result.data.indices).toHaveLength(3);
  });

  it("splits US indices out from the full watchlist by category", async () => {
    mockedUs.mockResolvedValue({
      status: "ok",
      rows: [
        { symbol: "SPY", name: "S&P 500", category: "indices", last: 500, change: 1, changePct: 0.2 },
        { symbol: "AAPL", name: "Apple", category: "stocks", last: 200, change: -1, changePct: -0.5 },
      ],
    });

    const result = await getMarketOverview({ scope: "us" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.indices.map((i) => i.symbol)).toEqual(["SPY"]);
  });

  it("has no indices concept for forex/crypto — movers come from the pairs/coins themselves", async () => {
    mockedForex.mockResolvedValue({ status: "ok", rows: [{ symbol: "EUR", name: "EUR/USD", last: 1.1, change: 0.01, changePct: 0.9 }] });

    const result = await getMarketOverview({ scope: "forex" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.indices).toEqual([]);
    expect(result.data.topGainers).toHaveLength(1);
  });

  it("propagates unavailable from the underlying source", async () => {
    mockedCrypto.mockResolvedValue({ status: "unavailable", reason: "CoinGecko returned 429" });

    const result = await getMarketOverview({ scope: "crypto" });
    expect(result).toEqual({ status: "unavailable", reason: "CoinGecko returned 429" });
  });

  it("returns null breadth rather than dividing by zero when nothing has a change value", async () => {
    mockedForex.mockResolvedValue({ status: "ok", rows: [{ symbol: "EUR", name: "EUR/USD", last: null, change: null, changePct: null }] });

    const result = await getMarketOverview({ scope: "forex" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.breadth).toBeNull();
  });
});

describe("getSectorHeatmap", () => {
  it("passes the category through and wraps the result", async () => {
    mockedHeatmap.mockResolvedValue({ status: "ok", entries: [{ symbol: "AAPL", name: "Apple", price: 200, value: 1, changePct: 0.5 }] });

    const result = await getSectorHeatmap({ category: "us_equity" });
    expect(result.status).toBe("ok");
    expect(mockedHeatmap).toHaveBeenCalledWith("us_equity");
  });

  it("propagates unavailable", async () => {
    mockedHeatmap.mockResolvedValue({ status: "unavailable", reason: "no data" });

    const result = await getSectorHeatmap({ category: "commodities" });
    expect(result).toEqual({ status: "unavailable", reason: "no data" });
  });
});
