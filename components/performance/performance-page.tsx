"use client";

import * as React from "react";
import { BarChart3, Percent, Target, TrendingDown, TrendingUp, Activity, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { KpiCard } from "@/components/trading-module/kpi-card";
import {
  PerformanceFilters,
  ALL,
  rangeLabel,
  type PerformanceFilterValue,
  type RangeValue,
} from "@/components/performance/performance-filters";
import { CalendarHeatmap } from "@/components/performance/calendar-heatmap";
import { DayDrilldownPanel } from "@/components/performance/day-drilldown-panel";
import { EquityBehaviorSection } from "@/components/performance/equity-behavior-section";
import { TradeLogPanel } from "@/components/performance/trade-log-panel";
import { InsightsPanel } from "@/components/performance/insights-panel";
import { Button } from "@/components/ui/button";
import { exportRowsToXlsx } from "@/lib/export/xlsx";
import {
  computePerformanceKpis,
  computeDailyPnlByCurrency,
  computeEquityCurve,
  computePnlDistribution,
  computeStreaks,
  computeSymbolPerformance,
  generateInsights,
  formatMoneyByCurrency,
  MARKET_CURRENCY,
} from "@/lib/performance/queries";
import type { PositionRow } from "@/lib/positions/types";

function rangeCutoff(range: RangeValue): Date | null {
  const now = new Date();
  switch (range) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case "ytd":
      return new Date(now.getFullYear(), 0, 1);
    case "all":
      return null;
  }
}

function narrative(kpis: ReturnType<typeof computePerformanceKpis>, range: RangeValue) {
  if (kpis.totalTrades === 0) {
    return `No closed trades ${rangeLabel(range).toLowerCase()} yet.`;
  }
  const moneyStr = formatMoneyByCurrency(kpis.netPnl);
  const winRateStr = kpis.winRate !== null ? `${kpis.winRate.toFixed(0)}% win rate` : "no win rate yet";
  return `Net ${moneyStr} across ${kpis.totalTrades} trade${kpis.totalTrades === 1 ? "" : "s"} ${rangeLabel(range).toLowerCase()} — ${winRateStr}.`;
}

export function PerformancePage({
  positions,
  accounts,
}: {
  positions: PositionRow[];
  accounts: { id: string; label: string }[];
}) {
  const [filter, setFilter] = React.useState<PerformanceFilterValue>({
    range: "30d",
    market: ALL,
    accountId: ALL,
    symbol: ALL,
    side: ALL,
  });
  const [month, setMonth] = React.useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDay, setSelectedDay] = React.useState<{ date: string; currency: "USD" | "INR" } | null>(null);

  const symbols = React.useMemo(() => Array.from(new Set(positions.map((p) => p.symbol))).sort(), [positions]);

  const filtered = React.useMemo(() => {
    const cutoff = rangeCutoff(filter.range);
    return positions.filter((p) => {
      const referenceDate = p.closedAt ?? p.openedAt;
      if (cutoff && referenceDate < cutoff) return false;
      if (filter.market !== ALL && p.market !== filter.market) return false;
      if (filter.accountId !== ALL && p.accountId !== filter.accountId) return false;
      if (filter.symbol !== ALL && p.symbol !== filter.symbol) return false;
      if (filter.side !== ALL && p.side !== filter.side) return false;
      return true;
    });
  }, [positions, filter]);

  const kpis = React.useMemo(() => computePerformanceKpis(filtered), [filtered]);
  const dailyByCurrency = React.useMemo(() => computeDailyPnlByCurrency(filtered), [filtered]);
  const equityCurves = React.useMemo(() => computeEquityCurve(filtered), [filtered]);
  const distributions = React.useMemo(() => computePnlDistribution(filtered), [filtered]);
  const streaksByCurrency = React.useMemo(() => computeStreaks(filtered), [filtered]);
  const symbolPerfByCurrency = React.useMemo(() => computeSymbolPerformance(filtered), [filtered]);
  const insightsByCurrency = React.useMemo(() => generateInsights(filtered), [filtered]);

  const currenciesPresent = (["USD", "INR"] as const).filter((c) => dailyByCurrency[c].length > 0);

  function handleExportAll() {
    const closed = filtered.filter((p) => p.status === "closed" && p.closedAt);
    exportRowsToXlsx(
      "performance-export",
      "Trades",
      closed.map((p) => ({
        Symbol: p.symbol,
        Market: p.market,
        Side: p.side.toUpperCase(),
        "P&L": p.pnl ?? 0,
        "R-Multiple": p.rr ?? "",
        "Date/Time": p.closedAt!.toISOString(),
        Entry: p.entryPrice,
        Exit: p.exitPrice ?? "",
        Size: p.quantity,
        Strategy: p.strategyLabel ?? "",
        Account: p.accountLabel,
      })),
    );
  }

  const drilldownPositions = selectedDay
    ? filtered.filter(
        (p) =>
          p.status === "closed" &&
          p.closedAt &&
          p.closedAt.toISOString().slice(0, 10) === selectedDay.date &&
          MARKET_CURRENCY[p.market] === selectedDay.currency,
      )
    : [];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Performance analysis · {new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </p>
            <h1 className="font-display text-4xl font-medium tracking-tight">
              A window of <span className="italic">discipline</span>, under review.
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">{narrative(kpis, filter.range)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Net P&L · this window</p>
            <p
              className={cn(
                "tabular-figures font-mono text-3xl font-semibold",
                Object.values(kpis.netPnl).some((v) => (v ?? 0) < 0) ? "text-negative" : "text-positive",
              )}
            >
              {formatMoneyByCurrency(kpis.netPnl)}
            </p>
            <p className="text-xs text-muted-foreground">
              {Object.values(kpis.maxDrawdown).some((v) => (v ?? 0) > 0)
                ? `▲ ${formatMoneyByCurrency(kpis.maxDrawdown)} max drawdown`
                : "0% max drawdown"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PerformanceFilters accounts={accounts} symbols={symbols} value={filter} onChange={setFilter} />
        <Button variant="outline" size="sm" onClick={handleExportAll} disabled={kpis.totalTrades === 0}>
          <Download className="size-3.5" /> Export
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard icon={BarChart3} label="Total Trades" value={String(kpis.totalTrades)} />
        <KpiCard
          icon={Percent}
          label="Win Rate"
          value={kpis.winRate !== null ? `${kpis.winRate.toFixed(1)}%` : "—"}
        />
        <KpiCard
          icon={Target}
          label="Avg R:R"
          value={kpis.avgRR !== null ? `${kpis.avgRR.toFixed(2)}R` : "—"}
        />
        <KpiCard
          icon={TrendingUp}
          label="Net P&L"
          value={formatMoneyByCurrency(kpis.netPnl)}
          tone={Object.values(kpis.netPnl).some((v) => (v ?? 0) < 0) ? "negative" : "positive"}
        />
        <KpiCard
          icon={TrendingDown}
          label="Max Drawdown"
          value={formatMoneyByCurrency(kpis.maxDrawdown)}
          tone="negative"
        />
        <KpiCard
          icon={Activity}
          label="Sharpe (R)"
          value={kpis.sharpe !== null ? kpis.sharpe.toFixed(2) : "—"}
          caption="from R-multiples, not $"
        />
      </div>

      {currenciesPresent.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No closed trades to chart for this filter yet.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {currenciesPresent.map((currency) => (
            <CalendarHeatmap
              key={currency}
              currency={currency}
              monthDate={month}
              onMonthChange={setMonth}
              dailyPoints={dailyByCurrency[currency]}
              selectedDate={selectedDay?.currency === currency ? selectedDay.date : null}
              onSelectDate={(date) => setSelectedDay(date ? { date, currency } : null)}
            />
          ))}
        </div>
      )}

      {selectedDay && (
        <DayDrilldownPanel
          date={selectedDay.date}
          currency={selectedDay.currency}
          positions={drilldownPositions}
          onClose={() => setSelectedDay(null)}
        />
      )}

      {currenciesPresent.length > 0 &&
        currenciesPresent.map((currency) => (
          <EquityBehaviorSection
            key={currency}
            currency={currency}
            equityCurve={equityCurves[currency]}
            distribution={distributions[currency]}
            streaks={streaksByCurrency[currency]}
            symbolPerformance={symbolPerfByCurrency[currency]}
          />
        ))}

      <TradeLogPanel positions={filtered} />

      {currenciesPresent.length > 0 &&
        currenciesPresent.map((currency) => (
          <InsightsPanel key={currency} insights={insightsByCurrency[currency]} />
        ))}
      {currenciesPresent.length === 0 && <InsightsPanel insights={[]} />}
    </div>
  );
}
