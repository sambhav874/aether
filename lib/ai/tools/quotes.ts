import "server-only";
import { z } from "zod";
import { getIndiaSymbolQuote } from "@/lib/market/quotes-india";
import { getSymbolQuote } from "@/lib/market/quotes-us";
import { getForexRates } from "@/lib/market/quotes-forex";
import { getWatchlistIndices } from "@/lib/market/watchlist";
import { resolvedSymbolHitSchema } from "./resolve-symbol";
import { ok, type ToolResult } from "./shared";

// Batched by design — see PLAN_AI_COPILOT.md §2 principle 2. Takes hits
// straight out of resolveSymbol() rather than bare strings: market/kind
// determine which upstream source a given symbol is even quotable from
// (India equities and indices, for instance, have no shared endpoint).
export const getQuoteInputSchema = z.object({
  symbols: z.array(resolvedSymbolHitSchema.pick({ symbol: true, name: true, market: true, kind: true, currency: true })).min(1).max(20),
});
export type GetQuoteInput = z.infer<typeof getQuoteInputSchema>;

export const quoteRowSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  last: z.number().nullable(),
  change: z.number().nullable(),
  changePct: z.number().nullable(),
  currency: z.string(),
  asOf: z.string(),
});
export type QuoteRow = z.infer<typeof quoteRowSchema>;

/**
 * Fetches live-or-latest quotes for a batch of already-resolved symbols,
 * routing each to its actual upstream source (NSE for India equities,
 * Finnhub for US, Frankfurter for forex, NSE's index feed for India
 * indices — see the four lib/market/* modules this wraps). `asOf` is this
 * call's own fetch time, not necessarily the exchange's own tick time —
 * forex in particular is Frankfurter's once-daily reference rate, never
 * intraday (lib/market/quotes-forex.ts).
 */
export async function getQuote(input: GetQuoteInput): Promise<ToolResult<{ quotes: QuoteRow[]; missing: string[] }>> {
  const asOf = new Date().toISOString();
  const quotes: QuoteRow[] = [];
  const missing: string[] = [];

  const indiaIndexSymbols = input.symbols.filter((s) => s.market === "india" && s.kind === "index");
  const indiaIndexRows = indiaIndexSymbols.length > 0 ? await getWatchlistIndices() : null;

  const indiaEquitySymbols = input.symbols.filter((s) => s.market === "india" && s.kind === "equity");
  const usSymbols = input.symbols.filter((s) => s.market === "us");
  const forexSymbols = input.symbols.filter((s) => s.market === "forex");
  const forexRates = forexSymbols.length > 0 ? await getForexRates() : null;

  for (const s of indiaIndexSymbols) {
    const row = indiaIndexRows?.status === "ok" ? indiaIndexRows.rows.find((r) => r.symbol === s.symbol) : undefined;
    if (row) {
      quotes.push({ symbol: s.symbol, name: s.name, last: row.last, change: row.change, changePct: row.changePct, currency: s.currency, asOf });
    } else {
      missing.push(s.symbol);
    }
  }

  for (const s of forexSymbols) {
    const row = forexRates?.status === "ok" ? forexRates.rows.find((r) => r.symbol === s.symbol) : undefined;
    if (row) {
      quotes.push({ symbol: s.symbol, name: s.name, last: row.last, change: row.change, changePct: row.changePct, currency: s.currency, asOf });
    } else {
      missing.push(s.symbol);
    }
  }

  const [indiaEquityResults, usResults] = await Promise.all([
    Promise.all(indiaEquitySymbols.map((s) => getIndiaSymbolQuote(s.symbol, s.name))),
    Promise.all(usSymbols.map((s) => getSymbolQuote(s.symbol, s.name))),
  ]);

  indiaEquityResults.forEach((result, i) => {
    const s = indiaEquitySymbols[i];
    if (result.status === "ok") {
      quotes.push({ ...result.row, currency: s.currency, asOf });
    } else {
      missing.push(s.symbol);
    }
  });

  usResults.forEach((result, i) => {
    const s = usSymbols[i];
    if (result.status === "ok") {
      quotes.push({ ...result.row, currency: s.currency, asOf });
    } else {
      missing.push(s.symbol);
    }
  });

  return ok({ quotes, missing });
}
