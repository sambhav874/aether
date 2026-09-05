import "server-only";
import type { QuoteListResult, QuoteRow } from "@/lib/market/types";
import { fetchWithTimeout } from "@/lib/http";

// Frankfurter serves the ECB's published reference rates — free, no key,
// but updated once per business day (~16:00 CET), not intraday. That's the
// only keyless forex source available (Finnhub gates real-time forex quotes
// behind a paid plan, confirmed by calling it directly). Rows are labeled
// accordingly rather than presented as live ticks.
const PAIRS: { symbol: string; name: string }[] = [
  { symbol: "EUR", name: "EUR/USD" },
  { symbol: "GBP", name: "GBP/USD" },
  { symbol: "JPY", name: "USD/JPY" },
  { symbol: "INR", name: "USD/INR" },
  { symbol: "AUD", name: "AUD/USD" },
  { symbol: "CAD", name: "USD/CAD" },
  { symbol: "CHF", name: "USD/CHF" },
  { symbol: "CNY", name: "USD/CNY" },
];

// USD-quote pairs (EUR, GBP, AUD) are conventionally written as "USD is
// worth this many of the other currency", so Frankfurter's USD-base rate
// needs inverting to match the row's display symbol.
const INVERTED = new Set(["EUR", "GBP", "AUD"]);

type FrankfurterRange = { rates: Record<string, Record<string, number>> };

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getForexRates(): Promise<QuoteListResult> {
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 10 * 24 * 60 * 60 * 1000);
    const symbols = PAIRS.map((p) => p.symbol).join(",");
    const response = await fetchWithTimeout(
      `https://api.frankfurter.dev/v1/${toDateStr(start)}..${toDateStr(end)}?base=USD&symbols=${symbols}`,
      { cache: "no-store" },
    );
    if (!response.ok) return { status: "unavailable", reason: `Frankfurter returned HTTP ${response.status}` };

    const data = (await response.json()) as FrankfurterRange;
    const dates = Object.keys(data.rates).sort();
    if (dates.length === 0) return { status: "unavailable", reason: "no rates in range" };

    const latestDate = dates[dates.length - 1];
    const prevDate = dates.length > 1 ? dates[dates.length - 2] : latestDate;
    const latest = data.rates[latestDate];
    const prev = data.rates[prevDate];

    const rows: QuoteRow[] = PAIRS.map((pair) => {
      const latestRaw = latest[pair.symbol];
      const prevRaw = prev[pair.symbol];
      if (latestRaw === undefined) return { symbol: pair.symbol, name: pair.name, last: null, change: null, changePct: null };

      const last = INVERTED.has(pair.symbol) ? 1 / latestRaw : latestRaw;
      const prevVal = prevRaw !== undefined ? (INVERTED.has(pair.symbol) ? 1 / prevRaw : prevRaw) : null;
      const change = prevVal !== null ? last - prevVal : null;
      const changePct = prevVal !== null && prevVal !== 0 ? (change! / prevVal) * 100 : null;

      return { symbol: pair.symbol, name: pair.name, last, change, changePct };
    });

    return { status: "ok", rows };
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : "network error" };
  }
}
