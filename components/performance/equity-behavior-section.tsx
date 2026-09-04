"use client";

import * as React from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis, Bar, BarChart, XAxis, Cell } from "recharts";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import type { EquityCurve, PnlBucket, StreakSummary, SymbolPerformanceRow } from "@/lib/performance/queries";

type EquityMode = "money" | "r";

function EquityCurvePanel({ curve, currency }: { curve: EquityCurve; currency: "USD" | "INR" }) {
  const [mode, setMode] = React.useState<EquityMode>("money");
  const isPositive = curve.current >= 0;

  const chartData = curve.points.map((p) => ({
    date: p.date,
    value: mode === "r" ? p.r : p.cumulative,
  }));

  return (
    <div className="surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Equity curve</h3>
          <p className="text-xs text-muted-foreground">Cumulative profit over the selected window</p>
        </div>
        <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5 text-xs">
          {([
            ["money", currency === "INR" ? "₹" : "$"],
            ["r", "R"],
          ] as [EquityMode, string][]).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-2 py-1 font-medium",
                mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-4 gap-3 border-b pb-3 text-xs">
        <div>
          <p className="text-muted-foreground uppercase">Starting</p>
          <p className="tabular-figures font-medium">{formatMoney(curve.starting, currency)}</p>
        </div>
        <div>
          <p className="text-muted-foreground uppercase">Current</p>
          <p className={cn("tabular-figures font-medium", isPositive ? "text-positive" : "text-negative")}>
            {formatMoney(curve.current, currency)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground uppercase">Peak</p>
          <p className="tabular-figures font-medium">{formatMoney(curve.peak, currency)}</p>
        </div>
        <div>
          <p className="text-muted-foreground uppercase">Drawdown</p>
          <p className="tabular-figures font-medium text-negative">−{formatMoney(curve.drawdown, currency)}</p>
        </div>
      </div>

      <div className="h-56">
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isPositive ? "var(--positive)" : "var(--negative)"} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={isPositive ? "var(--positive)" : "var(--negative)"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Tooltip
                formatter={(value) => (mode === "r" ? `${Number(value).toFixed(2)}R` : formatMoney(Number(value), currency))}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <Area type="monotone" dataKey="value" stroke={isPositive ? "var(--positive)" : "var(--negative)"} strokeWidth={2} fill="url(#equityFill)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No equity curve data available</div>
        )}
      </div>
    </div>
  );
}

function StreaksPanel({ streaks }: { streaks: StreakSummary }) {
  const currentIsWin = streaks.currentStreak.type === "win";
  return (
    <div className="surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Win / loss streaks</h3>
          <p className="text-xs text-muted-foreground">Current and historical runs</p>
        </div>
        {streaks.currentStreak.type && (
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", currentIsWin ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative")}>
            {currentIsWin ? "+" : "−"}{streaks.currentStreak.count} {currentIsWin ? "W" : "L"}
          </span>
        )}
      </div>

      <div className="divide-y text-sm">
        <div className="flex items-center justify-between py-2">
          <span className="text-muted-foreground">Current streak</span>
          <span className={cn("font-mono", currentIsWin ? "text-positive" : "text-negative")}>
            {streaks.currentStreak.type ? `${currentIsWin ? "+" : "-"}${streaks.currentStreak.count} ${currentIsWin ? "wins" : "losses"}` : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="text-muted-foreground">Longest win streak</span>
          <span className="font-mono">{streaks.longestWinStreak} trades</span>
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="text-muted-foreground">Longest loss streak</span>
          <span className="font-mono text-negative">{streaks.longestLossStreak} trades</span>
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="text-muted-foreground">Avg win streak</span>
          <span className="font-mono">{streaks.avgWinStreak.toFixed(1)}</span>
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="text-muted-foreground">Avg loss streak</span>
          <span className="font-mono">{streaks.avgLossStreak.toFixed(1)}</span>
        </div>
      </div>

      <p className="mt-3 mb-1.5 text-xs font-medium text-muted-foreground uppercase">Recent {streaks.recent.length} trades</p>
      {streaks.recent.length === 0 ? (
        <p className="text-xs text-muted-foreground">No recent trades on this page.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {streaks.recent.map((r, i) => (
            <span
              key={i}
              title={`${r.symbol}: ${r.pnl.toFixed(2)}`}
              className={cn("flex size-6 items-center justify-center rounded text-[10px] font-bold", r.win ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative")}
            >
              {r.win ? "W" : "L"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DistributionPanel({ buckets }: { buckets: PnlBucket[] }) {
  return (
    <div className="surface p-4">
      <h3 className="text-sm font-semibold">P&L distribution</h3>
      <p className="mb-3 text-xs text-muted-foreground">Per-trade profit/loss histogram</p>
      <div className="h-56">
        {buckets.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <XAxis dataKey="label" hide />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {buckets.map((b, i) => (
                  <Cell key={i} fill={b.isPositive ? "var(--positive)" : "var(--negative)"} fillOpacity={0.7} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No distribution data</div>
        )}
      </div>
    </div>
  );
}

function SymbolPerformancePanel({ rows }: { rows: SymbolPerformanceRow[]; currency: "USD" | "INR" }) {
  return (
    <div className="surface p-4">
      <h3 className="text-sm font-semibold">Symbol performance</h3>
      <p className="mb-3 text-xs text-muted-foreground">Breakdown by traded instrument</p>
      {rows.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No symbol performance data available</div>
      ) : (
        <div className="max-h-56 space-y-1.5 overflow-y-auto">
          {rows.slice(0, 10).map((r) => (
            <div key={r.symbol} className="flex items-center justify-between text-xs">
              <span className="font-medium">{r.symbol}</span>
              <span className="text-muted-foreground">{r.trades} trades · {r.winRate.toFixed(0)}% win</span>
              <span className={cn("tabular-figures font-medium", r.net >= 0 ? "text-positive" : "text-negative")}>
                {r.net >= 0 ? "+" : ""}
                {r.net.toFixed(0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EquityBehaviorSection({
  currency,
  equityCurve,
  distribution,
  streaks,
  symbolPerformance,
}: {
  currency: "USD" | "INR";
  equityCurve: EquityCurve;
  distribution: PnlBucket[];
  streaks: StreakSummary;
  symbolPerformance: SymbolPerformanceRow[];
}) {
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">Equity & behavior</h2>
      <p className="mb-3 text-sm text-muted-foreground">Cumulative profit, distribution, and streak diagnostics.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <EquityCurvePanel curve={equityCurve} currency={currency} />
        <StreaksPanel streaks={streaks} />
        <DistributionPanel buckets={distribution} />
        <SymbolPerformancePanel rows={symbolPerformance} currency={currency} />
      </div>
    </div>
  );
}
