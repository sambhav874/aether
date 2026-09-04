import "server-only";
import YahooFinance from "yahoo-finance2";
import type { CandleChartResult } from "@/lib/market/india-chart";

// yahoo-finance2 handles Yahoo's crumb/cookie session bootstrap itself (the
// same kind of WAF dance stock-nse-india does for NSE) — confirmed working
// live against real symbols (AAPL, RELIANCE.NS) where a bare fetch to
// Yahoo's endpoints gets rate-limited outright. Free, no key.
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export type CompanyHit = { symbol: string; name: string; exchange: string };

export type CompanyReport = {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  marketCap: number | null;
  sector: string | null;
  industry: string | null;
  website: string | null;
  description: string | null;
  employees: number | null;
  peRatioTrailing: number | null;
  peRatioForward: number | null;
  priceToBook: number | null;
  beta: number | null;
  dividendYield: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHigh: number | null;
  revenue: number | null;
  revenueGrowth: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  profitMargin: number | null;
  returnOnEquity: number | null;
  totalCash: number | null;
  totalDebt: number | null;
  freeCashflow: number | null;
  recommendation: string | null;
  recommendationMean: number | null;
  numberOfAnalysts: number | null;
  targetLow: number | null;
  targetMean: number | null;
  targetHigh: number | null;
  insiderHeldPercent: number | null;
  institutionHeldPercent: number | null;
  sharesOutstanding: number | null;
  floatShares: number | null;
  avgVolume: number | null;
  nextEarningsDate: string | null;
  exDividendDate: string | null;
  officers: { name: string; title: string; pay: number | null }[];
  quarterlyEarnings: { period: string; epsActual: number | null; epsEstimate: number | null; surprisePercent: number | null }[];
  incomeStatement: { endDate: string; totalRevenue: number; grossProfit: number; operatingExpenses: number; netIncome: number } | null;
  balanceSheet: { endDate: string; totalAssets: number | null; totalLiabilities: number | null; totalStockholderEquity: number | null; cash: number | null } | null;
  cashFlow: { endDate: string; operatingCashflow: number | null; capex: number | null; netIncome: number } | null;
  analystActions: { date: string; firm: string; action: string; toGrade: string; fromGrade: string | null }[];
};

export type CompanyReportResult =
  | { status: "ok"; report: CompanyReport }
  | { status: "unavailable"; reason: string };

export type CompanySearchResult =
  | { status: "ok"; hits: CompanyHit[] }
  | { status: "unavailable"; reason: string };

// Same reasoning as lib/market/quotes-us.ts's Finnhub cache: keep real
// upstream calls low regardless of how many tabs/users are looking at
// reports, and dedupe bursts that land on the same symbol/query together.
const REPORT_TTL_MS = 60_000;
const SEARCH_TTL_MS = 60_000;
const reportCache = new Map<string, { data: CompanyReportResult; expires: number }>();
const reportInFlight = new Map<string, Promise<CompanyReportResult>>();
const searchCache = new Map<string, { data: CompanySearchResult; expires: number }>();

export async function searchCompanies(query: string): Promise<CompanySearchResult> {
  const key = query.trim().toLowerCase();
  if (!key) return { status: "ok", hits: [] };

  const cached = searchCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;

  try {
    const res = await yf.search(key, { quotesCount: 8, newsCount: 0 });
    const hits: CompanyHit[] = (res.quotes ?? [])
      .filter((q): q is typeof q & { symbol: string } => "symbol" in q && Boolean(q.symbol))
      .map((q): CompanyHit => {
        const longname = "longname" in q && typeof q.longname === "string" ? q.longname : undefined;
        const shortname = "shortname" in q && typeof q.shortname === "string" ? q.shortname : undefined;
        const exchDisp = "exchDisp" in q && typeof q.exchDisp === "string" ? q.exchDisp : "";
        return { symbol: q.symbol, name: longname ?? shortname ?? q.symbol, exchange: exchDisp };
      });
    const result: CompanySearchResult = { status: "ok", hits };
    searchCache.set(key, { data: result, expires: Date.now() + SEARCH_TTL_MS });
    return result;
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : "network error" };
  }
}

function num(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

function fmtDate(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return null;
}

export async function getCompanyReport(symbol: string): Promise<CompanyReportResult> {
  const cached = reportCache.get(symbol);
  if (cached && cached.expires > Date.now()) return cached.data;

  const pending = reportInFlight.get(symbol);
  if (pending) return pending;

  const request = (async (): Promise<CompanyReportResult> => {
    try {
      const s = await yf.quoteSummary(symbol, {
        modules: [
          "summaryProfile",
          "summaryDetail",
          "financialData",
          "defaultKeyStatistics",
          "price",
          "assetProfile",
          "earningsHistory",
          "upgradeDowngradeHistory",
          "calendarEvents",
        ],
      });
      const price = s.price;
      if (!price) return { status: "unavailable", reason: `no data for ${symbol}` };

      // quoteSummary's balanceSheetHistory/cashflowStatementHistory/incomeStatementHistory
      // submodules have returned near-empty data from Yahoo since Nov 2024;
      // fundamentalsTimeSeries is the replacement Yahoo actually still populates.
      const period1 = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const [financials, balanceSheet, cashFlow] = await Promise.all([
        yf.fundamentalsTimeSeries(symbol, { period1, type: "annual", module: "financials" }).catch(() => []),
        yf.fundamentalsTimeSeries(symbol, { period1, type: "annual", module: "balance-sheet" }).catch(() => []),
        yf.fundamentalsTimeSeries(symbol, { period1, type: "annual", module: "cash-flow" }).catch(() => []),
      ]);
      const latestFinancials = financials.at(-1) as Record<string, unknown> | undefined;
      const latestBalanceSheet = balanceSheet.at(-1) as Record<string, unknown> | undefined;
      const latestCashFlow = cashFlow.at(-1) as Record<string, unknown> | undefined;

      const officers = (s.assetProfile?.companyOfficers ?? [])
        .slice(0, 6)
        .map((o) => ({ name: o.name, title: o.title, pay: o.totalPay ?? null }));

      const quarterlyEarnings = (s.earningsHistory?.history ?? []).map((h) => ({
        period: h.period,
        epsActual: h.epsActual,
        epsEstimate: h.epsEstimate,
        surprisePercent: h.surprisePercent,
      }));

      const incomeStatement = latestFinancials
        ? {
            endDate: fmtDate(latestFinancials.date) ?? "",
            totalRevenue: num(latestFinancials.totalRevenue) ?? 0,
            grossProfit: num(latestFinancials.grossProfit) ?? 0,
            operatingExpenses: num(latestFinancials.operatingExpense) ?? 0,
            netIncome: num(latestFinancials.netIncome) ?? 0,
          }
        : null;

      const balanceSheetSnapshot = latestBalanceSheet
        ? {
            endDate: fmtDate(latestBalanceSheet.date) ?? "",
            totalAssets: num(latestBalanceSheet.totalAssets),
            totalLiabilities: num(latestBalanceSheet.totalLiabilitiesNetMinorityInterest),
            totalStockholderEquity: num(latestBalanceSheet.stockholdersEquity),
            cash: num(latestBalanceSheet.cashCashEquivalentsAndShortTermInvestments),
          }
        : null;

      const cashFlowSnapshot = latestCashFlow
        ? {
            endDate: fmtDate(latestCashFlow.date) ?? "",
            operatingCashflow: num(latestCashFlow.operatingCashFlow),
            capex: num(latestCashFlow.capitalExpenditure),
            netIncome: num(latestFinancials?.netIncome) ?? 0,
          }
        : null;

      const analystActions = (s.upgradeDowngradeHistory?.history ?? [])
        .slice(0, 8)
        .map((h) => ({
          date: fmtDate(h.epochGradeDate) ?? "",
          firm: h.firm,
          action: h.action,
          toGrade: h.toGrade,
          fromGrade: h.fromGrade ?? null,
        }));

      const earningsDates = s.calendarEvents?.earnings?.earningsDate ?? [];
      const nextEarningsDate = earningsDates.length > 0 ? fmtDate(earningsDates[0]) : null;

      const report: CompanyReport = {
        symbol,
        name: price.longName ?? price.shortName ?? symbol,
        exchange: price.exchangeName ?? "",
        currency: price.currency ?? "USD",
        price: price.regularMarketPrice ?? null,
        change: price.regularMarketChange ?? null,
        changePercent: price.regularMarketChangePercent ?? null,
        marketCap: s.summaryDetail?.marketCap ?? null,
        sector: s.summaryProfile?.sector ?? null,
        industry: s.summaryProfile?.industry ?? null,
        website: s.summaryProfile?.website ?? null,
        description: s.summaryProfile?.longBusinessSummary ?? null,
        employees: s.summaryProfile?.fullTimeEmployees ?? null,
        peRatioTrailing: s.summaryDetail?.trailingPE ?? null,
        peRatioForward: s.summaryDetail?.forwardPE ?? null,
        priceToBook: s.defaultKeyStatistics?.priceToBook ?? null,
        beta: s.summaryDetail?.beta ?? null,
        dividendYield: s.summaryDetail?.dividendYield ?? null,
        fiftyTwoWeekLow: s.summaryDetail?.fiftyTwoWeekLow ?? null,
        fiftyTwoWeekHigh: s.summaryDetail?.fiftyTwoWeekHigh ?? null,
        revenue: s.financialData?.totalRevenue ?? null,
        revenueGrowth: s.financialData?.revenueGrowth ?? null,
        grossMargin: s.financialData?.grossMargins ?? null,
        operatingMargin: s.financialData?.operatingMargins ?? null,
        profitMargin: s.financialData?.profitMargins ?? null,
        returnOnEquity: s.financialData?.returnOnEquity ?? null,
        totalCash: s.financialData?.totalCash ?? null,
        totalDebt: s.financialData?.totalDebt ?? null,
        freeCashflow: s.financialData?.freeCashflow ?? null,
        recommendation: s.financialData?.recommendationKey ?? null,
        recommendationMean: s.financialData?.recommendationMean ?? null,
        numberOfAnalysts: s.financialData?.numberOfAnalystOpinions ?? null,
        targetLow: s.financialData?.targetLowPrice ?? null,
        targetMean: s.financialData?.targetMeanPrice ?? null,
        targetHigh: s.financialData?.targetHighPrice ?? null,
        insiderHeldPercent: s.defaultKeyStatistics?.heldPercentInsiders ?? null,
        institutionHeldPercent: s.defaultKeyStatistics?.heldPercentInstitutions ?? null,
        sharesOutstanding: s.defaultKeyStatistics?.sharesOutstanding ?? null,
        floatShares: s.defaultKeyStatistics?.floatShares ?? null,
        avgVolume: s.summaryDetail?.averageVolume ?? null,
        nextEarningsDate,
        exDividendDate: fmtDate(s.calendarEvents?.exDividendDate),
        officers,
        quarterlyEarnings,
        incomeStatement,
        balanceSheet: balanceSheetSnapshot,
        cashFlow: cashFlowSnapshot,
        analystActions,
      };

      return { status: "ok", report };
    } catch (error) {
      return { status: "unavailable", reason: error instanceof Error ? error.message : "network error" };
    }
  })();

  reportInFlight.set(symbol, request);
  try {
    const result = await request;
    reportCache.set(symbol, { data: result, expires: Date.now() + REPORT_TTL_MS });
    return result;
  } finally {
    reportInFlight.delete(symbol);
  }
}

const CHART_TTL_MS = 60_000;
const chartCache = new Map<string, { data: CandleChartResult; expires: number }>();

/** Daily OHLC for any Yahoo-covered symbol (US, global, or NSE .NS), via
 * yahoo-finance2's chart module — same free session-bootstrap as the rest
 * of this file. Used for the Company Research price chart. */
export async function getCompanyChart(symbol: string, days = 180): Promise<CandleChartResult> {
  const cacheKey = `${symbol}:${days}`;
  const cached = chartCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  try {
    const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const res = await yf.chart(symbol, { period1, interval: "1d", return: "array" });
    const candles = res.quotes
      .filter((q): q is typeof q & { open: number; high: number; low: number; close: number } =>
        typeof q.open === "number" && typeof q.high === "number" && typeof q.low === "number" && typeof q.close === "number",
      )
      .map((q) => ({
        time: q.date.toISOString().slice(0, 10),
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
      }));

    const result: CandleChartResult =
      candles.length > 0 ? { status: "ok", candles } : { status: "unavailable", reason: `no chart data for ${symbol}` };
    chartCache.set(cacheKey, { data: result, expires: Date.now() + CHART_TTL_MS });
    return result;
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : "network error" };
  }
}
