import { fetchWithTimeout } from "@/lib/http";

export type CryptoHeatmapEntry = {
  id: string;
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  changePct24h: number | null;
};

export type CryptoHeatmapResult =
  | { status: "ok"; entries: CryptoHeatmapEntry[] }
  | { status: "unavailable"; reason: string };

const COINGECKO_MARKETS_URL =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&price_change_percentage=24h";

/**
 * CoinGecko's public markets endpoint — free, keyless, fine at this call
 * volume (revalidated every 60s, not called per-request). Never throws:
 * a down/rate-limited feed degrades to an "unavailable" result the page can
 * render a clear empty state for, matching how the real product handles a
 * dead data source instead of crashing the page.
 */
export async function getCryptoHeatmap(): Promise<CryptoHeatmapResult> {
  try {
    const response = await fetchWithTimeout(COINGECKO_MARKETS_URL, {
      next: { revalidate: 60 },
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      return { status: "unavailable", reason: `CoinGecko returned ${response.status}` };
    }

    const data: unknown = await response.json();
    if (!Array.isArray(data)) {
      return { status: "unavailable", reason: "unexpected response shape" };
    }

    const entries: CryptoHeatmapEntry[] = data
      .map((coin) => {
        const c = coin as Record<string, unknown>;
        const id = typeof c.id === "string" ? c.id : null;
        const symbol = typeof c.symbol === "string" ? c.symbol : null;
        const name = typeof c.name === "string" ? c.name : null;
        const price = typeof c.current_price === "number" ? c.current_price : null;
        const marketCap = typeof c.market_cap === "number" ? c.market_cap : null;
        if (!id || !symbol || !name || price === null || marketCap === null) return null;
        const changePct24h =
          typeof c.price_change_percentage_24h === "number" ? c.price_change_percentage_24h : null;
        return { id, symbol: symbol.toUpperCase(), name, price, marketCap, changePct24h };
      })
      .filter((entry): entry is CryptoHeatmapEntry => entry !== null);

    if (entries.length === 0) {
      return { status: "unavailable", reason: "no instruments returned" };
    }

    return { status: "ok", entries };
  } catch (error) {
    return {
      status: "unavailable",
      reason: error instanceof Error ? error.message : "network error",
    };
  }
}
