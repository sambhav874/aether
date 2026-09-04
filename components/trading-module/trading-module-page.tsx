"use client";

import * as React from "react";
import {
  Activity,
  BarChart3,
  Percent,
  PiggyBank,
  Target,
  TrendingDown,
} from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/components/providers/appearance-provider";
import { staggerContainer } from "@/lib/motion";
import { KpiCard } from "@/components/trading-module/kpi-card";
import { HeroPnlCard } from "@/components/trading-module/hero-pnl-card";
import { CumulativePnlPanel, type PnlPoint } from "@/components/trading-module/cumulative-pnl-panel";
import { FilterTabBar, type PositionFilter } from "@/components/trading-module/filter-tab-bar";
import { GroupingToggle, type GroupingMode } from "@/components/trading-module/grouping-toggle";
import {
  ColumnVisibilityMenu,
  DEFAULT_VISIBLE_COLUMNS,
} from "@/components/trading-module/column-visibility-menu";
import { PositionsTable } from "@/components/trading-module/positions-table";
import { SettingsModal } from "@/components/trading-module/settings-modal";
import { OptionChainModal } from "@/components/trading-module/option-chain-modal";
import { ActivePositionsPanel } from "@/components/trading-module/active-positions-panel";
import { HeaderFilters, ALL, type HeaderFilterValue } from "@/components/trading-module/header-filters";
import type { Market } from "@/db/schema";
import type { PositionKpis, PositionRow } from "@/lib/positions/types";
import type { SaveSettingsState, TradingSettingsData, ClosePositionsResult } from "@/lib/positions/actions";
import { formatMoney } from "@/lib/format";

function isToday(date: Date) {
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function isWithinLast7Days(date: Date) {
  return Date.now() - date.getTime() <= 7 * 24 * 60 * 60 * 1000;
}

export function TradingModulePage({
  market,
  title,
  subtitle,
  currency,
  excludedFromTotals,
  kpis,
  pnlPoints,
  positions,
  settings,
  saveSettingsAction,
  closePositionsAction,
  availableBalance,
}: {
  market: Market;
  title: string;
  subtitle: string;
  currency: "USD" | "INR";
  /** Positions on this page denominated in some other currency. They still
   * appear in the table in their own currency, but are kept out of the
   * totals above it — adding them would be arithmetic across currencies. */
  excludedFromTotals?: { count: number; currencies: ("USD" | "INR")[] };
  kpis: PositionKpis;
  pnlPoints: PnlPoint[];
  positions: PositionRow[];
  settings: TradingSettingsData;
  saveSettingsAction: (prev: SaveSettingsState, formData: FormData) => Promise<SaveSettingsState>;
  closePositionsAction: (ids: string[]) => Promise<ClosePositionsResult>;
  availableBalance?: number;
}) {
  const { motion: appearanceMotion } = useAppearance();
  const [filter, setFilter] = React.useState<PositionFilter>("all");
  const [grouping, setGrouping] = React.useState<GroupingMode>("time");
  const [visibleColumns, setVisibleColumns] = React.useState(DEFAULT_VISIBLE_COLUMNS);
  const [headerFilter, setHeaderFilter] = React.useState<HeaderFilterValue>({
    symbol: ALL,
    strategyId: ALL,
    accountId: ALL,
  });

  const todayCount = positions.filter((p) => isToday(p.closedAt ?? p.openedAt)).length;

  const symbols = React.useMemo(
    () => Array.from(new Set(positions.map((p) => p.symbol))).sort(),
    [positions],
  );
  const strategyOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const p of positions) {
      if (p.strategyId) map.set(p.strategyId, p.strategyLabel ?? p.strategyId);
    }
    return Array.from(map, ([id, label]) => ({ id, label }));
  }, [positions]);
  const accountOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const p of positions) map.set(p.accountId, p.accountLabel);
    return Array.from(map, ([id, label]) => ({ id, label }));
  }, [positions]);

  const headerFilteredPositions = React.useMemo(() => {
    return positions.filter((p) => {
      if (headerFilter.symbol !== ALL && p.symbol !== headerFilter.symbol) return false;
      if (headerFilter.strategyId !== ALL && p.strategyId !== headerFilter.strategyId) return false;
      if (headerFilter.accountId !== ALL && p.accountId !== headerFilter.accountId) return false;
      return true;
    });
  }, [positions, headerFilter]);

  const filteredPositions = React.useMemo(() => {
    switch (filter) {
      case "today":
        return headerFilteredPositions.filter((p) => isToday(p.closedAt ?? p.openedAt));
      case "last7days":
        return headerFilteredPositions.filter((p) => isWithinLast7Days(p.closedAt ?? p.openedAt));
      case "most_profitable":
        return [...headerFilteredPositions]
          .filter((p) => (p.pnl ?? 0) > 0)
          .sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0));
      case "most_losing":
        return [...headerFilteredPositions]
          .filter((p) => (p.pnl ?? 0) < 0)
          .sort((a, b) => (a.pnl ?? 0) - (b.pnl ?? 0));
      default:
        return headerFilteredPositions;
    }
  }, [headerFilteredPositions, filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className={cn("size-1.5 rounded-full", kpis.openPositions > 0 ? "bg-positive" : "bg-muted-foreground")} />
              {kpis.totalTrades} trades
            </span>
            <span>· {todayCount} today</span>
            <span>· {kpis.openPositions} open</span>
          </div>
          <h1 className="font-display text-3xl font-medium tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {market === "indian_options" && <OptionChainModal />}
          <SettingsModal
            title={title}
            market={market}
            settings={settings}
            action={saveSettingsAction}
          />
        </div>
      </div>

      <motion.div
        className="space-y-3"
        variants={appearanceMotion === "reduced" ? undefined : staggerContainer}
        initial={appearanceMotion === "reduced" ? undefined : "hidden"}
        animate={appearanceMotion === "reduced" ? undefined : "show"}
      >
        {excludedFromTotals && excludedFromTotals.count > 0 && (
          <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            Totals below cover {currency} positions only — {excludedFromTotals.count}{" "}
            {excludedFromTotals.count === 1 ? "position" : "positions"} in{" "}
            {excludedFromTotals.currencies.join(", ")} {excludedFromTotals.count === 1 ? "is" : "are"} listed in the
            table but excluded, since summing across currencies would be meaningless.
          </p>
        )}

        <HeroPnlCard
          realizedPnl={kpis.realizedPnl}
          unrealizedPnl={kpis.unrealizedPnl}
          currency={currency}
        />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-7">
          {availableBalance !== undefined && (
            <KpiCard
              size="sm"
              icon={PiggyBank}
              label="Available Balance"
              value={formatMoney(availableBalance, currency)}
            />
          )}
          <KpiCard
            size="sm"
            icon={Activity}
            label="Open Positions"
            value={String(kpis.openPositions)}
            numeric={kpis.openPositions}
            format={(n) => String(Math.round(n))}
          />
          <KpiCard
            size="sm"
            icon={BarChart3}
            label="Today's Trades"
            value={String(todayCount)}
            numeric={todayCount}
            format={(n) => String(Math.round(n))}
          />
          <KpiCard
            size="sm"
            icon={Percent}
            label="Win Rate"
            value={kpis.winRate !== null ? `${kpis.winRate.toFixed(1)}%` : "—"}
            caption={
              kpis.winRate !== null ? (kpis.winRate >= 50 ? "above breakeven" : "below breakeven") : undefined
            }
          />
          <KpiCard
            size="sm"
            icon={Target}
            label="Average R"
            value={kpis.averageR !== null ? `${kpis.averageR.toFixed(2)}R` : "—"}
            caption={
              kpis.averageR !== null
                ? kpis.averageR >= 0
                  ? "expectancy positive"
                  : "expectancy negative"
                : undefined
            }
          />
          <KpiCard
            size="sm"
            icon={TrendingDown}
            label="Max Drawdown"
            value={formatMoney(kpis.maxDrawdown, currency)}
            numeric={kpis.maxDrawdown}
            format={(n) => formatMoney(n, currency)}
            tone="negative"
          />
          <KpiCard
            size="sm"
            icon={BarChart3}
            label="Total Trades"
            value={String(kpis.totalTrades)}
            numeric={kpis.totalTrades}
            format={(n) => String(Math.round(n))}
          />
        </div>
      </motion.div>

      <ActivePositionsPanel positions={headerFilteredPositions} currency={currency} closeAction={closePositionsAction} />

      <CumulativePnlPanel points={pnlPoints} currency={currency} />

      <HeaderFilters
        symbols={symbols}
        strategies={strategyOptions}
        accounts={accountOptions}
        value={headerFilter}
        onChange={setHeaderFilter}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabBar value={filter} onChange={setFilter} todayCount={todayCount} />
        <div className="flex items-center gap-2">
          <GroupingToggle value={grouping} onChange={setGrouping} />
          <ColumnVisibilityMenu visible={visibleColumns} onChange={setVisibleColumns} />
        </div>
      </div>

      <PositionsTable
        positions={filteredPositions}
        visibleColumns={visibleColumns}
        currency={currency}
        grouping={grouping}
      />
    </div>
  );
}
