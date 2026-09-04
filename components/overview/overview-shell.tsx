"use client";

import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { SummaryCard } from "@/components/overview/summary-card";
import { OverviewPositionsPanel } from "@/components/overview/positions-panel";
import { AccountsPanel, type AccountRow } from "@/components/overview/accounts-panel";
import { TradingViewAdvancedChart } from "@/components/charts/tradingview-advanced-chart";
import { IndiaChart } from "@/components/market/india-chart";
import { useAppearance } from "@/components/providers/appearance-provider";
import { useSelectedSymbol } from "@/components/market/selected-symbol-context";
import { staggerContainer, tabPillTransition } from "@/lib/motion";
import type { PositionKpis, PositionRow } from "@/lib/positions/types";

type MarketBlock = { kpis: PositionKpis; openPositions: PositionRow[] };

export function OverviewShell({
  nseOpen,
  forexLive,
  forex,
  options,
  accounts,
}: {
  nseOpen: boolean;
  forexLive: boolean;
  forex: MarketBlock;
  options: MarketBlock;
  accounts: AccountRow[];
}) {
  const [view, setView] = React.useState<"all" | "forex" | "options">("all");
  const { selected } = useSelectedSymbol();
  const { motion: appearanceMotion } = useAppearance();
  const reduced = appearanceMotion === "reduced";

  const forexTotal = forex.kpis.realizedPnl + forex.kpis.unrealizedPnl;
  const optionsTotal = options.kpis.realizedPnl + options.kpis.unrealizedPnl;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-medium tracking-tight">Market Overview</h1>
          <span
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium",
              nseOpen ? "text-positive" : "text-muted-foreground",
            )}
          >
            <span className={cn("size-1.5 rounded-full", nseOpen ? "bg-positive" : "bg-muted-foreground")} />
            {nseOpen ? "NSE Open" : "NSE Closed"}
          </span>
        </div>
        <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
          {(["all", "forex", "options"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setView(tab)}
              className={cn(
                "relative rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                view === tab ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {view === tab && (
                <motion.span
                  layoutId={reduced ? undefined : "overview-tab-pill"}
                  className="absolute inset-0 rounded-md bg-background shadow-sm"
                  transition={reduced ? { duration: 0 } : tabPillTransition}
                />
              )}
              <span className="relative">{tab}</span>
            </button>
          ))}
        </div>
      </div>

      <motion.div
        className="grid gap-3 md:grid-cols-3"
        variants={reduced ? undefined : staggerContainer}
        initial={reduced ? undefined : "hidden"}
        animate={reduced ? undefined : "show"}
      >
        {view !== "options" && (
          <SummaryCard
            title="Forex"
            badge={{ label: "FX Live", tone: forexLive ? "live" : "muted" }}
            primary={formatMoney(forexTotal, "USD")}
            primaryNumeric={forexTotal}
            primaryFormat={(n) => formatMoney(n, "USD")}
            primaryTone={forexTotal > 0 ? "positive" : forexTotal < 0 ? "negative" : "neutral"}
            breakdown={
              <span>
                Realized {formatMoney(forex.kpis.realizedPnl, "USD")} · Unrealized{" "}
                {formatMoney(forex.kpis.unrealizedPnl, "USD")}
              </span>
            }
            meta={`${forex.kpis.openPositions} open`}
            footnote="USD book · 24/5 · closes Fri 21:00 UTC"
          />
        )}
        {view !== "forex" && (
          <SummaryCard
            title="Indian Options"
            badge={{ label: "NSE", tone: nseOpen ? "open" : "muted" }}
            primary={formatMoney(optionsTotal, "INR")}
            primaryNumeric={optionsTotal}
            primaryFormat={(n) => formatMoney(n, "INR")}
            primaryTone={optionsTotal > 0 ? "positive" : optionsTotal < 0 ? "negative" : "neutral"}
            breakdown={
              <span>
                Realized {formatMoney(options.kpis.realizedPnl, "INR")} · Unrealized{" "}
                {formatMoney(options.kpis.unrealizedPnl, "INR")}
              </span>
            }
            meta={`${options.kpis.openPositions} open`}
            footnote="INR book · NSE live until 15:30"
          />
        )}
        {view === "all" && (
          <SummaryCard
            title="Combined · Today"
            primary="—"
            primaryTone="neutral"
            breakdown={
              <div className="space-y-0.5">
                <div>Forex {formatMoney(forexTotal, "USD")}</div>
                <div>Indian Options {formatMoney(optionsTotal, "INR")}</div>
              </div>
            }
            meta={`${forex.kpis.openPositions + options.kpis.openPositions} open`}
            footnote="Different currencies — totals shown per book"
          />
        )}
      </motion.div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          {selected ? (
            <p className="text-xs text-muted-foreground">
              Charting <span className="font-medium text-foreground">{selected.label}</span>
            </p>
          ) : (
            <span />
          )}
          {(() => {
            const linkSymbol = selected ? selected.tvSymbol : "OANDA:XAUUSD";
            return (
              linkSymbol && (
                <a
                  href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(linkSymbol)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Open on TradingView ↗
                </a>
              )
            );
          })()}
        </div>
        {selected?.source === "india" ? (
          <IndiaChart symbol={selected.symbol} kind={selected.kind} height={520} />
        ) : (
          <TradingViewAdvancedChart symbol={selected?.tvSymbol ?? "OANDA:XAUUSD"} height={520} />
        )}
      </div>

      <div className="space-y-4">
        <OverviewPositionsPanel
          tabs={[
            {
              market: "forex",
              label: "Forex",
              currency: "USD",
              positions: forex.openPositions,
              manageHref: "/dashboard/monarch/forex",
            },
            {
              market: "indian_options",
              label: "Indian Options",
              currency: "INR",
              positions: options.openPositions,
              manageHref: "/dashboard/monarch/indian-options",
            },
          ]}
        />

        <AccountsPanel accounts={accounts} />
      </div>
    </div>
  );
}
