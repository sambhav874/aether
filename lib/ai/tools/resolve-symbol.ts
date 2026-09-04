import "server-only";
import { z } from "zod";
import { searchCompanies } from "@/lib/research/company";
import { searchSymbols as searchUsSymbols } from "@/lib/market/quotes-us";
import { getWatchlistIndices } from "@/lib/market/watchlist";
import { ok, unavailable, type ToolResult } from "./shared";

// Symbol ambiguity is the #1 failure mode of every finance agent — see
// PLAN_AI_COPILOT.md §2.1 "Resolution". System-prompt rule for every other
// tool in this package: never pass a symbol to another tool unless it came
// out of resolveSymbol() first.

export const resolveSymbolInputSchema = z.object({
  query: z.string().min(1),
  market: z.enum(["india", "us", "forex"]).optional(),
});
export type ResolveSymbolInput = z.infer<typeof resolveSymbolInputSchema>;

export const symbolKindSchema = z.enum(["equity", "index", "forex_pair"]);
export type SymbolKind = z.infer<typeof symbolKindSchema>;

export const resolvedSymbolHitSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  exchange: z.string(),
  currency: z.string(),
  kind: symbolKindSchema,
  market: z.enum(["india", "us", "forex"]),
});
export type ResolvedSymbolHit = z.infer<typeof resolvedSymbolHitSchema>;

const MAX_HITS = 5;

// Static forex universe matches lib/market/quotes-forex.ts's PAIRS exactly
// — that module has no search endpoint of its own (Frankfurter, the keyless
// rate source it uses, doesn't offer one), so this is the whole resolvable
// forex universe today, not a placeholder subset.
const FOREX_PAIRS: { symbol: string; name: string }[] = [
  { symbol: "EUR", name: "EUR/USD" },
  { symbol: "GBP", name: "GBP/USD" },
  { symbol: "JPY", name: "USD/JPY" },
  { symbol: "INR", name: "USD/INR" },
  { symbol: "AUD", name: "AUD/USD" },
  { symbol: "CAD", name: "USD/CAD" },
  { symbol: "CHF", name: "USD/CHF" },
  { symbol: "CNY", name: "USD/CNY" },
];

function matchScore(query: string, symbol: string, name: string): number {
  const q = query.trim().toLowerCase();
  const s = symbol.toLowerCase();
  const n = name.toLowerCase();
  if (s === q) return 100;
  if (s.startsWith(q)) return 80;
  if (n.startsWith(q)) return 60;
  if (n.includes(q)) return 40;
  if (s.includes(q)) return 30;
  return 10;
}

async function resolveForex(query: string): Promise<ResolvedSymbolHit[]> {
  return FOREX_PAIRS.filter((p) => matchScore(query, p.symbol, p.name) > 10).map((p) => ({
    symbol: p.symbol,
    name: p.name,
    exchange: "FX",
    currency: "USD",
    kind: "forex_pair" as const,
    market: "forex" as const,
  }));
}

async function resolveIndia(query: string): Promise<ResolvedSymbolHit[]> {
  const hits: ResolvedSymbolHit[] = [];

  const indices = await getWatchlistIndices();
  if (indices.status === "ok") {
    for (const row of indices.rows) {
      if (matchScore(query, row.symbol, row.name) > 10) {
        hits.push({ symbol: row.symbol, name: row.name, exchange: row.tab, currency: "INR", kind: "index", market: "india" });
      }
    }
  }

  const companies = await searchCompanies(query);
  if (companies.status === "ok") {
    for (const hit of companies.hits) {
      const isIndia = /\.(NS|BO)$/i.test(hit.symbol) || /NSI|BSE|NSE/i.test(hit.exchange);
      if (isIndia) {
        hits.push({ symbol: hit.symbol, name: hit.name, exchange: hit.exchange || "NSE", currency: "INR", kind: "equity", market: "india" });
      }
    }
  }

  return hits;
}

async function resolveUs(query: string): Promise<ResolvedSymbolHit[]> {
  const hits: ResolvedSymbolHit[] = [];

  const finnhub = await searchUsSymbols(query);
  if (finnhub.status === "ok") {
    for (const hit of finnhub.hits) {
      hits.push({ symbol: hit.symbol, name: hit.name, exchange: "US", currency: "USD", kind: "equity", market: "us" });
    }
  }

  const yahoo = await searchCompanies(query);
  if (yahoo.status === "ok") {
    for (const hit of yahoo.hits) {
      const isIndia = /\.(NS|BO)$/i.test(hit.symbol) || /NSI|BSE|NSE/i.test(hit.exchange);
      if (!isIndia) {
        hits.push({ symbol: hit.symbol, name: hit.name, exchange: hit.exchange || "US", currency: "USD", kind: "equity", market: "us" });
      }
    }
  }

  return hits;
}

function dedupe(hits: ResolvedSymbolHit[]): ResolvedSymbolHit[] {
  const seen = new Set<string>();
  const out: ResolvedSymbolHit[] = [];
  for (const hit of hits) {
    const key = `${hit.market}:${hit.symbol.toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}

/**
 * Resolves a free-text query (or a bare-looking ticker) to a small, ranked
 * set of concrete symbols, each tagged with the market/kind/currency every
 * other tool needs to route correctly. Never throws — a total failure
 * across every source still returns `status: "ok"` with an empty hit list,
 * since "no matches" is a valid, expected outcome the agent should just ask
 * the user about, not an error condition.
 */
export async function resolveSymbol(input: ResolveSymbolInput): Promise<ToolResult<{ hits: ResolvedSymbolHit[] }>> {
  const query = input.query.trim();
  if (!query) return ok({ hits: [] });

  const groups = await Promise.allSettled([
    !input.market || input.market === "forex" ? resolveForex(query) : Promise.resolve<ResolvedSymbolHit[]>([]),
    !input.market || input.market === "india" ? resolveIndia(query) : Promise.resolve<ResolvedSymbolHit[]>([]),
    !input.market || input.market === "us" ? resolveUs(query) : Promise.resolve<ResolvedSymbolHit[]>([]),
  ]);

  const merged = groups.flatMap((g) => (g.status === "fulfilled" ? g.value : []));
  if (merged.length === 0 && groups.every((g) => g.status === "rejected")) {
    return unavailable("every symbol source failed — try again shortly");
  }

  const ranked = dedupe(merged)
    .map((hit) => ({ hit, score: matchScore(query, hit.symbol, hit.name) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_HITS)
    .map((r) => r.hit);

  return ok({ hits: ranked });
}
