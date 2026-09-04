import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { instrumentFundamentals } from "@/db/schema/ai";
import { getCompanyReport, type CompanyReport } from "@/lib/research/company";
import { SYMBOLS } from "@/lib/heatmap/yahoo";

/**
 * Powers screen_stocks (lib/ai/tools/screen.ts) — see
 * PLAN_AI_COPILOT.md §2.1 "Screening": a live per-symbol sweep across a
 * whole universe isn't viable (minutes of latency, real rate-limit risk),
 * so this nightly job pre-computes a snapshot the tool reads instantly.
 *
 * The universe is `us_equity` + `india_fno` + `india_equity` from
 * lib/heatmap/yahoo.ts — reused deliberately rather than a fresh
 * "nifty50"/"sp500" constituent list maintained here. Those are
 * already-curated, already-in-production symbol sets; inventing a second,
 * separately-sourced list for this job risks drift and (worse) a
 * hallucinated ticker. `screen_stocks`'s universe options are named after
 * these categories, not after index names this deployment can't actually
 * verify membership for.
 */
const UNIVERSE = [...SYMBOLS.us_equity, ...SYMBOLS.india_fno, ...SYMBOLS.india_equity];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function mapWithLimit<T, R>(items: T[], limit: number, delayMs: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    results.push(...(await Promise.all(batch.map(fn))));
    if (i + limit < items.length) await sleep(delayMs);
  }
  return results;
}

export function toPercent(v: number | null): string | null {
  return v === null ? null : (v * 100).toFixed(4);
}

export function debtToEquity(report: CompanyReport): string | null {
  const equity = report.balanceSheet?.totalStockholderEquity;
  if (report.totalDebt === null || !equity || equity === 0) return null;
  return (report.totalDebt / equity).toFixed(4);
}

export type RefreshSummary = { attempted: number; updated: number; failed: string[] };

export async function refreshInstrumentFundamentals(): Promise<RefreshSummary> {
  const failed: string[] = [];
  let updated = 0;

  await mapWithLimit(UNIVERSE, 5, 500, async ({ symbol, name }) => {
    const result = await getCompanyReport(symbol);
    if (result.status === "unavailable") {
      failed.push(symbol);
      return;
    }
    const r = result.report;

    await db
      .insert(instrumentFundamentals)
      .values({
        symbol,
        exchange: r.exchange || (symbol.endsWith(".NS") ? "NSE" : "US"),
        name: r.name || name,
        sector: r.sector,
        industry: r.industry,
        marketCap: r.marketCap?.toFixed(2) ?? null,
        pe: r.peRatioTrailing?.toFixed(4) ?? null,
        pb: r.priceToBook?.toFixed(4) ?? null,
        roe: toPercent(r.returnOnEquity),
        revenueGrowth: toPercent(r.revenueGrowth),
        profitMargin: toPercent(r.profitMargin),
        debtToEquity: debtToEquity(r),
        dividendYield: toPercent(r.dividendYield),
        beta: r.beta?.toFixed(4) ?? null,
        ret1y: null, // not populated by this job — use compute_indicators's ret1y for a live figure, avoids a second network call per symbol here
        refreshedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: instrumentFundamentals.symbol,
        set: {
          exchange: sql`excluded.exchange`,
          name: sql`excluded.name`,
          sector: sql`excluded.sector`,
          industry: sql`excluded.industry`,
          marketCap: sql`excluded.market_cap`,
          pe: sql`excluded.pe`,
          pb: sql`excluded.pb`,
          roe: sql`excluded.roe`,
          revenueGrowth: sql`excluded.revenue_growth`,
          profitMargin: sql`excluded.profit_margin`,
          debtToEquity: sql`excluded.debt_to_equity`,
          dividendYield: sql`excluded.dividend_yield`,
          beta: sql`excluded.beta`,
          refreshedAt: sql`excluded.refreshed_at`,
        },
      });
    updated += 1;
  });

  return { attempted: UNIVERSE.length, updated, failed };
}
