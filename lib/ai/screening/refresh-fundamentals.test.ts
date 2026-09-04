import { describe, it, expect, vi } from "vitest";

// toPercent/debtToEquity are pure, but this module also imports @/db/client
// at the top level (for refreshInstrumentFundamentals) — db/client.ts
// throws at import time without a real DATABASE_URL, which vitest doesn't
// load from .env.local the way `next dev`/drizzle-kit do. Mocked out here
// purely to make the module importable; nothing in this file touches it.
vi.mock("@/db/client", () => ({ db: {} }));

import { toPercent, debtToEquity } from "./refresh-fundamentals";
import type { CompanyReport } from "@/lib/research/company";

function report(overrides: Partial<CompanyReport> = {}): CompanyReport {
  return {
    symbol: "TEST",
    name: "Test Co",
    exchange: "US",
    currency: "USD",
    price: 100,
    change: 1,
    changePercent: 1,
    marketCap: 1000,
    sector: null,
    industry: null,
    website: null,
    description: null,
    employees: null,
    peRatioTrailing: null,
    peRatioForward: null,
    priceToBook: null,
    beta: null,
    dividendYield: null,
    fiftyTwoWeekLow: null,
    fiftyTwoWeekHigh: null,
    revenue: null,
    revenueGrowth: null,
    grossMargin: null,
    operatingMargin: null,
    profitMargin: null,
    returnOnEquity: null,
    totalCash: null,
    totalDebt: null,
    freeCashflow: null,
    recommendation: null,
    recommendationMean: null,
    numberOfAnalysts: null,
    targetLow: null,
    targetMean: null,
    targetHigh: null,
    insiderHeldPercent: null,
    institutionHeldPercent: null,
    sharesOutstanding: null,
    floatShares: null,
    avgVolume: null,
    nextEarningsDate: null,
    exDividendDate: null,
    officers: [],
    quarterlyEarnings: [],
    incomeStatement: null,
    balanceSheet: null,
    cashFlow: null,
    analystActions: [],
    ...overrides,
  };
}

describe("toPercent", () => {
  it("converts a fraction to a percentage string", () => {
    expect(toPercent(0.234)).toBe("23.4000");
  });

  it("passes null through", () => {
    expect(toPercent(null)).toBeNull();
  });
});

describe("debtToEquity", () => {
  it("computes totalDebt / totalStockholderEquity when both are available", () => {
    const r = report({ totalDebt: 500, balanceSheet: { endDate: "2026-06-30", totalAssets: null, totalLiabilities: null, totalStockholderEquity: 1000, cash: null } });
    expect(debtToEquity(r)).toBe("0.5000");
  });

  it("is null when there's no balance sheet snapshot at all", () => {
    const r = report({ totalDebt: 500, balanceSheet: null });
    expect(debtToEquity(r)).toBeNull();
  });

  it("is null when equity is zero (would divide by zero)", () => {
    const r = report({ totalDebt: 500, balanceSheet: { endDate: "2026-06-30", totalAssets: null, totalLiabilities: null, totalStockholderEquity: 0, cash: null } });
    expect(debtToEquity(r)).toBeNull();
  });

  it("is null when totalDebt itself is null", () => {
    const r = report({ totalDebt: null, balanceSheet: { endDate: "2026-06-30", totalAssets: null, totalLiabilities: null, totalStockholderEquity: 1000, cash: null } });
    expect(debtToEquity(r)).toBeNull();
  });
});
