import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CompanyReport, CompanyReportResult } from "@/lib/research/company";

vi.mock("@/lib/research/company", () => ({
  getCompanyReport: vi.fn(),
}));

import { getCompanyReport } from "@/lib/research/company";
import { compareFundamentals, getFundamentals } from "./fundamentals";

const mockedGetCompanyReport = vi.mocked(getCompanyReport);

function makeReport(overrides: Partial<CompanyReport>): CompanyReport {
  return {
    symbol: "TEST",
    name: "Test Co",
    exchange: "NSI",
    currency: "INR",
    price: 100,
    change: 1,
    changePercent: 1.5,
    marketCap: 1_000_000,
    sector: "Technology",
    industry: "Software",
    website: null,
    description: null,
    employees: null,
    peRatioTrailing: 20,
    peRatioForward: 18,
    priceToBook: 5,
    beta: 1.1,
    dividendYield: 0.02, // 2% as a fraction — must come out as 2 after conversion
    fiftyTwoWeekLow: 80,
    fiftyTwoWeekHigh: 120,
    revenue: 500_000,
    revenueGrowth: 0.1, // 10%
    grossMargin: 0.4,
    operatingMargin: 0.2,
    profitMargin: 0.15,
    returnOnEquity: 0.25,
    totalCash: 10_000,
    totalDebt: 5_000,
    freeCashflow: 3_000,
    recommendation: "buy",
    recommendationMean: 2,
    numberOfAnalysts: 10,
    targetLow: 90,
    targetMean: 110,
    targetHigh: 130,
    insiderHeldPercent: 0.05,
    institutionHeldPercent: 0.6,
    sharesOutstanding: 1_000,
    floatShares: 900,
    avgVolume: 50_000,
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

beforeEach(() => {
  mockedGetCompanyReport.mockReset();
});

describe("getFundamentals", () => {
  it("returns only the requested sections, with percent-fraction fields converted", async () => {
    mockedGetCompanyReport.mockResolvedValue({ status: "ok", report: makeReport({ symbol: "TCS", name: "Tata Consultancy" }) } satisfies CompanyReportResult);

    const result = await getFundamentals({ symbol: "TCS", sections: ["valuation"] });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(Object.keys(result.data.sections)).toEqual(["valuation"]);
    expect(result.data.sections.valuation.dividendYield).toBeCloseTo(2, 10); // 0.02 -> 2
    expect(result.data.sections.valuation.peRatioTrailing).toBe(20);
    // profitability wasn't requested — must not leak through
    expect(result.data.sections.profitability).toBeUndefined();
  });

  it("propagates the unavailable reason without retrying or fabricating data", async () => {
    mockedGetCompanyReport.mockResolvedValue({ status: "unavailable", reason: "no data for XYZ" } satisfies CompanyReportResult);

    const result = await getFundamentals({ symbol: "XYZ", sections: ["snapshot"] });
    expect(result).toEqual({ status: "unavailable", reason: "no data for XYZ" });
  });
});

describe("compareFundamentals", () => {
  it("builds one row per available symbol and lists the rest as missing", async () => {
    mockedGetCompanyReport.mockImplementation(async (symbol: string) => {
      if (symbol === "GOOD") return { status: "ok", report: makeReport({ symbol: "GOOD", name: "Good Co", peRatioTrailing: 15 }) };
      return { status: "unavailable", reason: `no data for ${symbol}` };
    });

    const result = await compareFundamentals({ symbols: ["GOOD", "BAD"], metrics: ["peRatioTrailing", "dividendYield"] });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.data.rows).toHaveLength(1);
    expect(result.data.rows[0].symbol).toBe("GOOD");
    expect(result.data.rows[0].peRatioTrailing).toBe(15);
    expect(result.data.rows[0].dividendYield).toBeCloseTo(2, 10);
    expect(result.data.missing).toEqual(["BAD"]);
  });

  it("reports units per metric, distinguishing currency/percent/ratio/count", async () => {
    mockedGetCompanyReport.mockResolvedValue({ status: "ok", report: makeReport({}) });

    const result = await compareFundamentals({ symbols: ["A", "B"], metrics: ["marketCap", "dividendYield", "peRatioTrailing", "numberOfAnalysts"] });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.data.units).toEqual({
      marketCap: "currency",
      dividendYield: "%",
      peRatioTrailing: "x",
      numberOfAnalysts: "count",
    });
  });

  it("is unavailable when every symbol fails, not an empty ok result", async () => {
    mockedGetCompanyReport.mockResolvedValue({ status: "unavailable", reason: "network error" });

    const result = await compareFundamentals({ symbols: ["A", "B"], metrics: ["price"] });
    expect(result.status).toBe("unavailable");
  });
});
