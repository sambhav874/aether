"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/components/trading-module/empty-state";
import type { PositionRow } from "@/lib/positions/types";

type MarketTab = {
  market: "forex" | "indian_options";
  label: string;
  currency: "USD" | "INR";
  positions: PositionRow[];
  manageHref: string;
};

export function OverviewPositionsPanel({ tabs }: { tabs: MarketTab[] }) {
  const [active, setActive] = React.useState(tabs[0].market);
  const current = tabs.find((t) => t.market === active)!;
  const unrealized = current.positions.reduce((sum, p) => sum + (p.pnl ?? 0), 0);

  return (
    <div className="card-elevated rounded-lg border border-border/70 bg-card">
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Positions</h2>
          <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
            {tabs.map((tab) => (
              <button
                key={tab.market}
                type="button"
                onClick={() => setActive(tab.market)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors",
                  active === tab.market
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "tabular-figures rounded-full px-1.5 text-xs",
                    active === tab.market ? "bg-primary-foreground/20" : "bg-background",
                  )}
                >
                  {tab.positions.length}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            Unrealized{" "}
            <span
              className={cn(
                "tabular-figures font-medium",
                unrealized > 0 && "text-positive",
                unrealized < 0 && "text-negative",
              )}
            >
              {formatMoney(unrealized, current.currency)}
            </span>
          </span>
          <Link href={current.manageHref} className="font-medium text-foreground hover:underline">
            Manage →
          </Link>
        </div>
      </div>

      {current.positions.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title="No Open Positions"
            description="Open positions in this market will show up here."
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Symbol</th>
                <th className="px-3 py-2 font-medium">Side</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Entry</th>
                <th className="px-3 py-2 text-right font-medium">P&L</th>
                <th className="px-3 py-2 text-right font-medium">SL</th>
              </tr>
            </thead>
            <tbody>
              {current.positions.map((position) => (
                <tr key={position.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{position.symbol}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-xs font-medium uppercase",
                        position.side === "long"
                          ? "bg-positive/10 text-positive"
                          : "bg-negative/10 text-negative",
                      )}
                    >
                      {position.side}
                    </span>
                  </td>
                  <td className="tabular-figures px-3 py-2 text-right">{position.quantity}</td>
                  <td className="tabular-figures px-3 py-2 text-right">
                    {position.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </td>
                  <td
                    className={cn(
                      "tabular-figures px-3 py-2 text-right font-medium",
                      (position.pnl ?? 0) > 0 && "text-positive",
                      (position.pnl ?? 0) < 0 && "text-negative",
                    )}
                  >
                    {formatMoney(position.pnl, current.currency)}
                  </td>
                  <td className="tabular-figures px-3 py-2 text-right text-muted-foreground">
                    {position.sl?.toLocaleString(undefined, { maximumFractionDigits: 4 }) ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
