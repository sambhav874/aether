"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { formatMoney as formatCurrency } from "@/lib/format";
import { AnimatedNumber } from "@/components/motion/animated-number";

export type PnlPoint = { date: string; cumulative: number };

export function CumulativePnlPanel({
  points,
  currency,
}: {
  points: PnlPoint[];
  currency: "USD" | "INR";
}) {
  const values = points.map((p) => p.cumulative);
  const current = values.at(-1) ?? 0;
  const peak = values.length ? Math.max(...values) : 0;
  const trough = values.length ? Math.min(...values) : 0;

  const dailyDeltas = values.map((v, i) => (i === 0 ? v : v - values[i - 1]));
  const best = dailyDeltas.length ? Math.max(...dailyDeltas) : 0;
  const worst = dailyDeltas.length ? Math.min(...dailyDeltas) : 0;

  const isPositive = current >= 0;

  return (
    <div className="card-elevated rounded-lg border border-border/70 bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Cumulative P&L</p>
          <p
            className={cn(
              "tabular-figures text-3xl font-semibold",
              isPositive ? "text-positive" : "text-negative",
            )}
          >
            <AnimatedNumber value={current} format={(n) => formatCurrency(n, currency)} />
          </p>
        </div>
        <div className="grid grid-cols-4 gap-4 text-right text-xs">
          <Stat label="Peak" value={formatCurrency(peak, currency)} />
          <Stat label="Trough" value={formatCurrency(trough, currency)} />
          <Stat label="Best day" value={formatCurrency(best, currency)} tone="positive" />
          <Stat label="Worst day" value={formatCurrency(worst, currency)} tone="negative" />
        </div>
      </div>

      <div className="mt-4 h-32">
        {points.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={isPositive ? "var(--positive)" : "var(--negative)"}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="100%"
                    stopColor={isPositive ? "var(--positive)" : "var(--negative)"}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value), currency)}
                labelFormatter={(label) => label}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke={isPositive ? "var(--positive)" : "var(--negative)"}
                strokeWidth={2}
                fill="url(#pnlFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Not enough data yet
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tabular-figures font-medium",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
        )}
      >
        {value}
      </p>
    </div>
  );
}
