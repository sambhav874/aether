"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import type { PositionRow } from "@/lib/positions/types";

export function DayDrilldownPanel({
  date,
  currency,
  positions,
  onClose,
}: {
  date: string;
  currency: "USD" | "INR";
  positions: PositionRow[];
  onClose: () => void;
}) {
  const label = new Date(date).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const total = positions.reduce((sum, p) => sum + (p.pnl ?? 0), 0);

  return (
    <div className="card-elevated rounded-lg border border-border/70 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{label}</h3>
          <p
            className={cn(
              "tabular-figures text-xs",
              total >= 0 ? "text-positive" : "text-negative",
            )}
          >
            {positions.length} trade{positions.length === 1 ? "" : "s"} · {formatMoney(total, currency)}
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
          Close
        </button>
      </div>

      <div className="space-y-1.5">
        {positions.map((position) => (
          <div
            key={position.id}
            className="flex items-center justify-between gap-3 rounded-md border px-2.5 py-1.5 text-xs"
          >
            <span className="font-medium">{position.symbol}</span>
            <Badge variant={position.side === "long" ? "default" : "destructive"} className="text-[10px]">
              {position.side === "long" ? "LONG" : "SHORT"}
            </Badge>
            <span className="text-muted-foreground">{position.accountLabel}</span>
            <span
              className={cn(
                "tabular-figures ml-auto font-medium",
                (position.pnl ?? 0) >= 0 ? "text-positive" : "text-negative",
              )}
            >
              {formatMoney(position.pnl, currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
