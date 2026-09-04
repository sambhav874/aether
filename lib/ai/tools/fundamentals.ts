import "server-only";
import { z } from "zod";
import { getCompanyReport, type CompanyReport } from "@/lib/research/company";
import { ok, unavailable, type ToolResult } from "./shared";

// Yahoo (via lib/research/company.ts) reports these as fractions (0.234),
// not human percentages — converted once here so every consumer (both
// get_fundamentals and compare_fundamentals) sees the same clean number
// and unit, rather than each caller (or worse, the model) re-deriving it.
const PERCENT_FRACTION_FIELDS = new Set<keyof CompanyReport>([
  "dividendYield",
  "revenueGrowth",
  "grossMargin",
  "operatingMargin",
  "profitMargin",
  "returnOnEquity",
  "insiderHeldPercent",
  "institutionHeldPercent",
]);

function toDisplay(field: keyof CompanyReport, value: unknown): unknown {
  if (typeof value !== "number") return value;
  return PERCENT_FRACTION_FIELDS.has(field) ? value * 100 : value;
}

// --- get_fundamentals ------------------------------------------------

export const FUNDAMENTALS_SECTIONS = [
  "snapshot",
  "valuation",
  "profitability",
  "growth",
  "balance",
  "cashflow",
  "analysts",
  "earnings",
  "ownership",
  "profile",
] as const;
export type FundamentalsSection = (typeof FUNDAMENTALS_SECTIONS)[number];

const SECTION_FIELDS: Record<FundamentalsSection, (keyof CompanyReport)[]> = {
  snapshot: ["symbol", "name", "exchange", "currency", "price", "change", "changePercent", "marketCap", "sector", "industry"],
  profile: ["website", "description", "employees", "sector", "industry"],
  valuation: ["peRatioTrailing", "peRatioForward", "priceToBook", "marketCap", "dividendYield", "beta", "fiftyTwoWeekLow", "fiftyTwoWeekHigh"],
  profitability: ["grossMargin", "operatingMargin", "profitMargin", "returnOnEquity"],
  growth: ["revenue", "revenueGrowth"],
  balance: ["totalCash", "totalDebt", "balanceSheet"],
  cashflow: ["freeCashflow", "cashFlow"],
  analysts: ["recommendation", "recommendationMean", "numberOfAnalysts", "targetLow", "targetMean", "targetHigh", "analystActions"],
  earnings: ["nextEarningsDate", "exDividendDate", "quarterlyEarnings", "incomeStatement"],
  ownership: ["insiderHeldPercent", "institutionHeldPercent", "sharesOutstanding", "floatShares", "avgVolume", "officers"],
};

export const getFundamentalsInputSchema = z.object({
  symbol: z.string(),
  // Defaults to "snapshot" alone (~200 tok) rather than the full ~2.5k-token
  // report — see PLAN_AI_COPILOT.md §2 principle 3.
  sections: z.array(z.enum(FUNDAMENTALS_SECTIONS)).min(1).default(["snapshot"]),
});
export type GetFundamentalsInput = z.infer<typeof getFundamentalsInputSchema>;

export async function getFundamentals(input: GetFundamentalsInput): Promise<ToolResult<{ symbol: string; asOf: string; sections: Record<string, Record<string, unknown>> }>> {
  const result = await getCompanyReport(input.symbol);
  if (result.status === "unavailable") return unavailable(result.reason);

  const sections: Record<string, Record<string, unknown>> = {};
  for (const section of input.sections) {
    const fields = SECTION_FIELDS[section];
    const values: Record<string, unknown> = {};
    for (const field of fields) {
      values[field] = toDisplay(field, result.report[field]);
    }
    sections[section] = values;
  }

  return ok({ symbol: input.symbol, asOf: new Date().toISOString(), sections });
}

// --- compare_fundamentals ---------------------------------------------

export const COMPARE_METRICS = [
  "price",
  "changePercent",
  "marketCap",
  "peRatioTrailing",
  "peRatioForward",
  "priceToBook",
  "dividendYield",
  "beta",
  "fiftyTwoWeekLow",
  "fiftyTwoWeekHigh",
  "revenueGrowth",
  "grossMargin",
  "operatingMargin",
  "profitMargin",
  "returnOnEquity",
  "totalCash",
  "totalDebt",
  "freeCashflow",
  "sharesOutstanding",
  "floatShares",
  "avgVolume",
  "insiderHeldPercent",
  "institutionHeldPercent",
  "numberOfAnalysts",
  "targetMean",
] as const satisfies readonly (keyof CompanyReport)[];
export type CompareMetric = (typeof COMPARE_METRICS)[number];

const METRIC_UNITS: Record<CompareMetric, string> = {
  price: "currency",
  changePercent: "%",
  marketCap: "currency",
  peRatioTrailing: "x",
  peRatioForward: "x",
  priceToBook: "x",
  dividendYield: "%",
  beta: "x",
  fiftyTwoWeekLow: "currency",
  fiftyTwoWeekHigh: "currency",
  revenueGrowth: "%",
  grossMargin: "%",
  operatingMargin: "%",
  profitMargin: "%",
  returnOnEquity: "%",
  totalCash: "currency",
  totalDebt: "currency",
  freeCashflow: "currency",
  sharesOutstanding: "count",
  floatShares: "count",
  avgVolume: "count",
  insiderHeldPercent: "%",
  institutionHeldPercent: "%",
  numberOfAnalysts: "count",
  targetMean: "currency",
};

const METRIC_ALIASES: Record<string, CompareMetric> = {
  pe: "peRatioTrailing",
  peratio: "peRatioTrailing",
  pe_ratio: "peRatioTrailing",
  "p/e": "peRatioTrailing",
  "p/e ratio": "peRatioTrailing",
  pe_trailing: "peRatioTrailing",
  petrailing: "peRatioTrailing",
  pe_forward: "peRatioForward",
  peforward: "peRatioForward",
  forward_pe: "peRatioForward",
  forwardpe: "peRatioForward",
  roe: "returnOnEquity",
  return_on_equity: "returnOnEquity",
  returnonequity: "returnOnEquity",
  pb: "priceToBook",
  p_b: "priceToBook",
  "p/b": "priceToBook",
  pricetobook: "priceToBook",
  price_to_book: "priceToBook",
  market_cap: "marketCap",
  marketcap: "marketCap",
  dividend_yield: "dividendYield",
  dividendyield: "dividendYield",
  volume: "avgVolume",
  avg_volume: "avgVolume",
  avgvolume: "avgVolume",
  beta: "beta",
  revenue_growth: "revenueGrowth",
  profit_margin: "profitMargin",
  gross_margin: "grossMargin",
  operating_margin: "operatingMargin",
  free_cashflow: "freeCashflow",
  total_debt: "totalDebt",
  total_cash: "totalCash",
};

export const compareFundamentalsInputSchema = z.object({
  symbols: z.array(z.string()).min(1).max(10).describe("List of stock tickers (e.g. ['TCS.NS', 'INFY.NS'])"),
  metrics: z.array(z.string()).min(1).describe("List of metrics to compare (e.g. ['peRatioTrailing', 'returnOnEquity'])"),
});
export type CompareFundamentalsInput = z.infer<typeof compareFundamentalsInputSchema>;

export type CompareFundamentalsRow = { symbol: string; name: string; currency: string } & Record<string, number | string | null>;

/**
 * Server-built comparison table over a batch of symbols — the highest-
 * leverage tool in the catalog per PLAN_AI_COPILOT.md §2.1: comparison is
 * what people actually ask for ("is X cheaper than Y"), and building the
 * table here removes any chance of a transcription error the model might
 * introduce copying numbers into a markdown table itself.
 */
export async function compareFundamentals(input: CompareFundamentalsInput): Promise<ToolResult<{ rows: CompareFundamentalsRow[]; units: Record<string, string>; missing: string[] }>> {
  const normalizedMetrics: CompareMetric[] = Array.from(
    new Set(
      input.metrics
        .map((m) => {
          if (COMPARE_METRICS.includes(m as CompareMetric)) return m as CompareMetric;
          const clean = m.toLowerCase().trim();
          return METRIC_ALIASES[clean] ?? null;
        })
        .filter((m): m is CompareMetric => m !== null),
    ),
  );

  const effectiveMetrics = normalizedMetrics.length > 0 ? normalizedMetrics : (["price", "marketCap", "peRatioTrailing"] as CompareMetric[]);

  const reports = await Promise.all(input.symbols.map((symbol) => getCompanyReport(symbol)));

  const rows: CompareFundamentalsRow[] = [];
  const missing: string[] = [];

  reports.forEach((result, i) => {
    const symbol = input.symbols[i];
    if (result.status === "unavailable") {
      missing.push(symbol);
      return;
    }
    const row: CompareFundamentalsRow = { symbol, name: result.report.name, currency: result.report.currency };
    for (const metric of effectiveMetrics) {
      row[metric] = toDisplay(metric, result.report[metric]) as number | string | null;
    }
    rows.push(row);
  });

  if (rows.length === 0) return unavailable(`no fundamentals available for any of: ${input.symbols.join(", ")}`);

  const units = Object.fromEntries(effectiveMetrics.map((m) => [m, METRIC_UNITS[m]]));
  return ok({ rows, units, missing });
}
