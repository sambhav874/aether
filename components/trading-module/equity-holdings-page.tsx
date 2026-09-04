"use client";

import * as React from "react";
import { Wallet, BarChart3, PiggyBank } from "lucide-react";
import { KpiCard } from "@/components/trading-module/kpi-card";
import { HeroPnlCard } from "@/components/trading-module/hero-pnl-card";
import {
  ColumnVisibilityMenu,
  DEFAULT_VISIBLE_COLUMNS,
} from "@/components/trading-module/column-visibility-menu";
import { PositionsTable } from "@/components/trading-module/positions-table";
import { HeaderFilters, ALL, type HeaderFilterValue } from "@/components/trading-module/header-filters";
import { formatMoney } from "@/lib/format";
import type { PositionKpis, PositionRow } from "@/lib/positions/types";

export function EquityHoldingsPage({
  title,
  subtitle,
  currency,
  kpis,
  positions,
  availableBalance,
}: {
  title: string;
  subtitle: string;
  currency: "USD" | "INR";
  kpis: PositionKpis;
  positions: PositionRow[];
  availableBalance?: number;
}) {
  const [visibleColumns, setVisibleColumns] = React.useState(DEFAULT_VISIBLE_COLUMNS);
  const [headerFilter, setHeaderFilter] = React.useState<HeaderFilterValue>({
    symbol: ALL,
    strategyId: ALL,
    accountId: ALL,
  });

  const symbols = React.useMemo(
    () => Array.from(new Set(positions.map((p) => p.symbol))).sort(),
    [positions],
  );
  const accountOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const p of positions) map.set(p.accountId, p.accountLabel);
    return Array.from(map, ([id, label]) => ({ id, label }));
  }, [positions]);

  const filtered = React.useMemo(() => {
    return positions.filter((p) => {
      if (headerFilter.symbol !== ALL && p.symbol !== headerFilter.symbol) return false;
      if (headerFilter.accountId !== ALL && p.accountId !== headerFilter.accountId) return false;
      return true;
    });
  }, [positions, headerFilter]);

  const holdings = filtered.filter((p) => p.status === "open");
  const closed = filtered.filter((p) => p.status === "closed");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <HeroPnlCard
        realizedPnl={kpis.realizedPnl}
        unrealizedPnl={kpis.unrealizedPnl}
        currency={currency}
      />

      <div className="grid grid-cols-3 gap-3">
        <KpiCard size="sm" icon={Wallet} label="Holdings" value={String(kpis.openPositions)} />
        <KpiCard size="sm" icon={BarChart3} label="Total Trades" value={String(kpis.totalTrades)} />
        {availableBalance !== undefined && (
          <KpiCard
            size="sm"
            icon={PiggyBank}
            label="Available Balance"
            value={formatMoney(availableBalance, currency)}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <HeaderFilters
          symbols={symbols}
          strategies={[]}
          accounts={accountOptions}
          value={headerFilter}
          onChange={setHeaderFilter}
        />
        <ColumnVisibilityMenu visible={visibleColumns} onChange={setVisibleColumns} />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Holdings</h2>
        <PositionsTable positions={holdings} visibleColumns={visibleColumns} currency={currency} />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Closed</h2>
        <PositionsTable positions={closed} visibleColumns={visibleColumns} currency={currency} />
      </div>
    </div>
  );
}
