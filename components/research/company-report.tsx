"use client";

import * as React from "react";
import {
  Search,
  Download,
  TrendingUp,
  DollarSign,
  Users,
  PieChart,
  CalendarDays,
  FileText,
  Landmark,
  Wallet,
  UserRound,
  BarChart3,
  Gavel,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { searchCompaniesAction, fetchCompanyReportAction } from "@/lib/research/company-actions";
import type { CompanyHit, CompanyReport, CompanyReportResult } from "@/lib/research/company";
import { Sparkline } from "@/components/research/sparkline";

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function exportReportCsv(report: CompanyReport) {
  const rows: [string, string][] = [
    ["Symbol", report.symbol],
    ["Name", report.name],
    ["Exchange", report.exchange],
    ["Currency", report.currency],
    ["Price", String(report.price ?? "")],
    ["Change", String(report.change ?? "")],
    ["Change %", String(report.changePercent ?? "")],
    ["Sector", report.sector ?? ""],
    ["Industry", report.industry ?? ""],
    ["Website", report.website ?? ""],
    ["Market Cap", String(report.marketCap ?? "")],
    ["P/E Trailing", String(report.peRatioTrailing ?? "")],
    ["P/E Forward", String(report.peRatioForward ?? "")],
    ["Price/Book", String(report.priceToBook ?? "")],
    ["Beta", String(report.beta ?? "")],
    ["Dividend Yield", String(report.dividendYield ?? "")],
    ["52W Low", String(report.fiftyTwoWeekLow ?? "")],
    ["52W High", String(report.fiftyTwoWeekHigh ?? "")],
    ["Revenue", String(report.revenue ?? "")],
    ["Revenue Growth", String(report.revenueGrowth ?? "")],
    ["Gross Margin", String(report.grossMargin ?? "")],
    ["Operating Margin", String(report.operatingMargin ?? "")],
    ["Profit Margin", String(report.profitMargin ?? "")],
    ["Return on Equity", String(report.returnOnEquity ?? "")],
    ["Total Cash", String(report.totalCash ?? "")],
    ["Total Debt", String(report.totalDebt ?? "")],
    ["Free Cash Flow", String(report.freeCashflow ?? "")],
    ["Recommendation", report.recommendation ?? ""],
    ["Recommendation Score", String(report.recommendationMean ?? "")],
    ["Number of Analysts", String(report.numberOfAnalysts ?? "")],
    ["Target Low", String(report.targetLow ?? "")],
    ["Target Mean", String(report.targetMean ?? "")],
    ["Target High", String(report.targetHigh ?? "")],
    ["Insider Held %", String(report.insiderHeldPercent ?? "")],
    ["Institution Held %", String(report.institutionHeldPercent ?? "")],
    ["Shares Outstanding", String(report.sharesOutstanding ?? "")],
    ["Float Shares", String(report.floatShares ?? "")],
    ["Avg Volume", String(report.avgVolume ?? "")],
    ["Employees", String(report.employees ?? "")],
    ["Next Earnings Date", report.nextEarningsDate ?? ""],
    ["Ex-Dividend Date", report.exDividendDate ?? ""],
  ];
  if (report.incomeStatement) {
    rows.push(
      [`Total Revenue (${report.incomeStatement.endDate})`, String(report.incomeStatement.totalRevenue)],
      [`Gross Profit (${report.incomeStatement.endDate})`, String(report.incomeStatement.grossProfit)],
      [`Operating Expenses (${report.incomeStatement.endDate})`, String(report.incomeStatement.operatingExpenses)],
      [`Net Income (${report.incomeStatement.endDate})`, String(report.incomeStatement.netIncome)],
    );
  }
  if (report.balanceSheet) {
    rows.push(
      [`Total Assets (${report.balanceSheet.endDate})`, String(report.balanceSheet.totalAssets ?? "")],
      [`Total Liabilities (${report.balanceSheet.endDate})`, String(report.balanceSheet.totalLiabilities ?? "")],
      [`Stockholder Equity (${report.balanceSheet.endDate})`, String(report.balanceSheet.totalStockholderEquity ?? "")],
      [`Cash (${report.balanceSheet.endDate})`, String(report.balanceSheet.cash ?? "")],
    );
  }
  if (report.cashFlow) {
    rows.push(
      [`Operating Cash Flow (${report.cashFlow.endDate})`, String(report.cashFlow.operatingCashflow ?? "")],
      [`Capital Expenditure (${report.cashFlow.endDate})`, String(report.cashFlow.capex ?? "")],
    );
  }

  const lines = [
    "Field,Value",
    ...rows.map(([k, v]) => `${csvEscape(k)},${csvEscape(v)}`),
    "",
    "Officer,Title,Total Pay",
    ...report.officers.map((o) => `${csvEscape(o.name)},${csvEscape(o.title)},${o.pay ?? ""}`),
    "",
    "Earnings Period,EPS Actual,EPS Estimate,Surprise %",
    ...report.quarterlyEarnings.map(
      (e) => `${csvEscape(e.period)},${e.epsActual ?? ""},${e.epsEstimate ?? ""},${e.surprisePercent ?? ""}`,
    ),
    "",
    "Analyst Date,Firm,Action,From Grade,To Grade",
    ...report.analystActions.map(
      (a) => `${csvEscape(a.date)},${csvEscape(a.firm)},${csvEscape(a.action)},${csvEscape(a.fromGrade ?? "")},${csvEscape(a.toGrade)}`,
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${report.symbol}-report.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function formatLarge(n: number | null): string {
  if (n === null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
}

function formatPrice(n: number | null, currency: string): string {
  if (n === null) return "—";
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatPct(n: number | null): string {
  if (n === null) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function formatNum(n: number | null, digits = 2): string {
  return n === null ? "—" : n.toFixed(digits);
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-figures">{value}</span>
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="card-elevated surface p-4">
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className="size-3.5 text-muted-foreground" />
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      </div>
      <div className="divide-y divide-border/70">{children}</div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function ReportView({ report }: { report: CompanyReport }) {
  const [expanded, setExpanded] = React.useState(false);
  const positive = (report.change ?? 0) >= 0;

  return (
    <div className="space-y-4">
      <div className="card-elevated surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-medium tracking-tight">{report.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge>{report.symbol}</Badge>
              {report.exchange && <Badge>{report.exchange}</Badge>}
              {report.sector && <Badge>{report.sector}</Badge>}
              {report.industry && <Badge>{report.industry}</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Sparkline symbol={report.symbol} />
            <div className="text-right">
              <p className="font-display text-2xl font-medium tabular-figures">{formatPrice(report.price, report.currency)}</p>
              <p
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-sm tabular-figures",
                  positive ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative",
                )}
              >
                {positive ? "+" : ""}
                {formatNum(report.change)} ({positive ? "+" : ""}
                {formatPct(report.changePercent)})
              </p>
            </div>
            <button
              type="button"
              onClick={() => exportReportCsv(report)}
              className="flex items-center gap-1.5 self-start rounded-md border border-border/70 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted/50"
            >
              <Download className="size-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {report.description && (
          <div className="mt-4 border-t border-border/70 pt-3">
            <p className={cn("text-sm text-muted-foreground", !expanded && "line-clamp-3")}>{report.description}</p>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-1 text-xs font-medium text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          </div>
        )}
        {report.website && (
          <a
            href={report.website}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Building2 className="size-3" />
            {report.website}
          </a>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <SectionCard title="Valuation" icon={TrendingUp}>
          <StatRow label="Market Cap" value={formatLarge(report.marketCap)} />
          <StatRow label="P/E (Trailing)" value={formatNum(report.peRatioTrailing)} />
          <StatRow label="P/E (Forward)" value={formatNum(report.peRatioForward)} />
          <StatRow label="Price/Book" value={formatNum(report.priceToBook)} />
          <StatRow label="Beta" value={formatNum(report.beta)} />
          <StatRow label="Dividend Yield" value={formatPct(report.dividendYield)} />
          <StatRow
            label="52W Range"
            value={report.fiftyTwoWeekLow !== null && report.fiftyTwoWeekHigh !== null ? `${formatNum(report.fiftyTwoWeekLow)} – ${formatNum(report.fiftyTwoWeekHigh)}` : "—"}
          />
        </SectionCard>

        <SectionCard title="Financials" icon={DollarSign}>
          <StatRow label="Revenue" value={formatLarge(report.revenue)} />
          <StatRow label="Revenue Growth" value={formatPct(report.revenueGrowth)} />
          <StatRow label="Gross Margin" value={formatPct(report.grossMargin)} />
          <StatRow label="Operating Margin" value={formatPct(report.operatingMargin)} />
          <StatRow label="Profit Margin" value={formatPct(report.profitMargin)} />
          <StatRow label="Return on Equity" value={formatPct(report.returnOnEquity)} />
          <StatRow label="Free Cash Flow" value={formatLarge(report.freeCashflow)} />
          <StatRow label="Cash / Debt" value={`${formatLarge(report.totalCash)} / ${formatLarge(report.totalDebt)}`} />
        </SectionCard>

        <SectionCard title="Analyst View" icon={Users}>
          <StatRow label="Recommendation" value={report.recommendation ? report.recommendation.replace(/_/g, " ").toUpperCase() : "—"} />
          <StatRow label="Score (1=Buy, 5=Sell)" value={formatNum(report.recommendationMean)} />
          <StatRow label="Analysts" value={report.numberOfAnalysts !== null ? String(report.numberOfAnalysts) : "—"} />
          <StatRow label="Target Low" value={formatNum(report.targetLow)} />
          <StatRow label="Target Mean" value={formatNum(report.targetMean)} />
          <StatRow label="Target High" value={formatNum(report.targetHigh)} />
        </SectionCard>

        <SectionCard title="Ownership" icon={PieChart}>
          <StatRow label="Insider Held" value={formatPct(report.insiderHeldPercent)} />
          <StatRow label="Institution Held" value={formatPct(report.institutionHeldPercent)} />
          <StatRow label="Shares Outstanding" value={formatLarge(report.sharesOutstanding)} />
          <StatRow label="Float Shares" value={formatLarge(report.floatShares)} />
          <StatRow label="Avg Volume" value={formatLarge(report.avgVolume)} />
          {report.employees !== null && <StatRow label="Employees" value={report.employees.toLocaleString()} />}
        </SectionCard>

        <SectionCard title="Key Dates" icon={CalendarDays}>
          <StatRow label="Next Earnings" value={report.nextEarningsDate ?? "—"} />
          <StatRow label="Ex-Dividend Date" value={report.exDividendDate ?? "—"} />
        </SectionCard>
      </div>

      {report.incomeStatement || report.balanceSheet || report.cashFlow ? (
        <div className="grid gap-3 md:grid-cols-3">
          {report.incomeStatement && (
            <SectionCard title={`Income Statement · ${report.incomeStatement.endDate}`} icon={FileText}>
              <StatRow label="Total Revenue" value={formatLarge(report.incomeStatement.totalRevenue)} />
              <StatRow label="Gross Profit" value={formatLarge(report.incomeStatement.grossProfit)} />
              <StatRow label="Operating Expenses" value={formatLarge(report.incomeStatement.operatingExpenses)} />
              <StatRow label="Net Income" value={formatLarge(report.incomeStatement.netIncome)} />
            </SectionCard>
          )}
          {report.balanceSheet && (
            <SectionCard title={`Balance Sheet · ${report.balanceSheet.endDate}`} icon={Landmark}>
              <StatRow label="Total Assets" value={formatLarge(report.balanceSheet.totalAssets)} />
              <StatRow label="Total Liabilities" value={formatLarge(report.balanceSheet.totalLiabilities)} />
              <StatRow label="Stockholder Equity" value={formatLarge(report.balanceSheet.totalStockholderEquity)} />
              <StatRow label="Cash" value={formatLarge(report.balanceSheet.cash)} />
            </SectionCard>
          )}
          {report.cashFlow && (
            <SectionCard title={`Cash Flow · ${report.cashFlow.endDate}`} icon={Wallet}>
              <StatRow label="Operating Cash Flow" value={formatLarge(report.cashFlow.operatingCashflow)} />
              <StatRow label="Capital Expenditure" value={formatLarge(report.cashFlow.capex)} />
              <StatRow label="Net Income" value={formatLarge(report.cashFlow.netIncome)} />
            </SectionCard>
          )}
        </div>
      ) : null}

      {(report.officers.length > 0 || report.quarterlyEarnings.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {report.officers.length > 0 && (
            <SectionCard title="Key Executives" icon={UserRound}>
              {report.officers.map((o) => (
                <div key={o.name} className="flex items-center justify-between gap-4 py-1.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{o.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{o.title}</p>
                  </div>
                  <span className="shrink-0 tabular-figures text-muted-foreground">{o.pay !== null ? formatLarge(o.pay) : ""}</span>
                </div>
              ))}
            </SectionCard>
          )}

          {report.quarterlyEarnings.length > 0 && (
            <SectionCard title="Quarterly Earnings (EPS)" icon={BarChart3}>
              <div className="flex items-center justify-between gap-4 py-1.5 text-xs text-muted-foreground">
                <span>Period</span>
                <span>Actual / Est.</span>
                <span>Surprise</span>
              </div>
              {report.quarterlyEarnings.map((e) => (
                <div key={e.period} className="flex items-center justify-between gap-4 py-1.5 text-sm">
                  <span className="text-muted-foreground">{e.period}</span>
                  <span className="tabular-figures">
                    {formatNum(e.epsActual)} / {formatNum(e.epsEstimate)}
                  </span>
                  <span
                    className={cn(
                      "tabular-figures",
                      e.surprisePercent !== null ? (e.surprisePercent >= 0 ? "text-positive" : "text-negative") : "",
                    )}
                  >
                    {e.surprisePercent !== null ? `${(e.surprisePercent * 100).toFixed(1)}%` : "—"}
                  </span>
                </div>
              ))}
            </SectionCard>
          )}
        </div>
      )}

      {report.analystActions.length > 0 && (
        <SectionCard title="Recent Analyst Actions" icon={Gavel}>
          {report.analystActions.map((a, i) => (
            <div key={`${a.date}-${a.firm}-${i}`} className="flex items-center justify-between gap-4 py-1.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{a.firm}</p>
                <p className="text-xs text-muted-foreground">{a.date}</p>
              </div>
              <span className="shrink-0 text-right text-sm">
                {a.fromGrade && a.fromGrade !== a.toGrade ? `${a.fromGrade} → ` : ""}
                {a.toGrade}
                <span className="ml-2 text-xs text-muted-foreground uppercase">{a.action}</span>
              </span>
            </div>
          ))}
        </SectionCard>
      )}
    </div>
  );
}

export function CompanyResearchPage() {
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<CompanyHit[]>([]);
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [result, setResult] = React.useState<CompanyReportResult | null>(null);
  const [loadingReport, setLoadingReport] = React.useState(false);

  React.useEffect(() => {
    const timeout = setTimeout(() => {
      if (!query.trim()) {
        setHits([]);
        return;
      }
      startTransition(async () => {
        const res = await searchCompaniesAction(query);
        setHits(res.status === "ok" ? res.hits : []);
        setOpen(true);
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  async function pick(hit: CompanyHit) {
    setQuery("");
    setHits([]);
    setOpen(false);
    setLoadingReport(true);
    const res = await fetchCompanyReportAction(hit.symbol);
    setResult(res);
    setLoadingReport(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Company Research</h1>
        <p className="text-sm text-muted-foreground">Search any public company for a full fundamentals report</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search company or ticker…"
          className="h-10 w-full rounded-md border border-border/70 bg-background pr-3 pl-9 text-sm shadow-sm transition-colors focus:border-ring focus:outline-none"
        />
        {open && (pending || hits.length > 0) && (
          <div className="card-elevated absolute top-full z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border/70 bg-popover">
            {pending ? (
              <p className="p-3 text-sm text-muted-foreground">Searching…</p>
            ) : (
              hits.map((hit) => (
                <button
                  key={hit.symbol}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    void pick(hit);
                  }}
                >
                  <span className="font-medium">{hit.symbol}</span>
                  <span className="truncate pl-2 text-muted-foreground">
                    {hit.name}
                    {hit.exchange && ` · ${hit.exchange}`}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {loadingReport ? (
        <div className="space-y-4">
          <div className="card-elevated surface h-32 animate-pulse p-5" />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="card-elevated surface h-40 animate-pulse p-4" />
            ))}
          </div>
        </div>
      ) : result?.status === "ok" ? (
        <ReportView report={result.report} />
      ) : result?.status === "unavailable" ? (
        <div className="surface flex flex-col items-center gap-1 border-dashed p-12 text-center">
          <Building2 className="mb-1 size-6 text-muted-foreground" />
          <p className="font-medium">Report unavailable</p>
          <p className="text-sm text-muted-foreground">{result.reason}</p>
        </div>
      ) : (
        <div className="surface flex flex-col items-center gap-1 border-dashed p-12 text-center text-sm text-muted-foreground">
          <Search className="mb-1 size-6" />
          Search for a company above to see its report.
        </div>
      )}
    </div>
  );
}
