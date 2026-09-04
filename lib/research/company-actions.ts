"use server";

import { requireActiveWorkspace } from "@/lib/auth/session";
import { searchCompanies, getCompanyReport, getCompanyChart } from "@/lib/research/company";
import type { CompanyReportResult, CompanySearchResult } from "@/lib/research/company";
import type { CandleChartResult } from "@/lib/market/india-chart";

export async function searchCompaniesAction(query: string): Promise<CompanySearchResult> {
  await requireActiveWorkspace();
  return searchCompanies(query);
}

export async function fetchCompanyReportAction(symbol: string): Promise<CompanyReportResult> {
  await requireActiveWorkspace();
  return getCompanyReport(symbol);
}

export async function fetchCompanyChartAction(symbol: string): Promise<CandleChartResult> {
  await requireActiveWorkspace();
  return getCompanyChart(symbol);
}
