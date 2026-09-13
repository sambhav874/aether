"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { DailyPnlPoint } from "@/lib/performance/queries";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function intensityClass(pnl: number, maxAbs: number) {
  if (maxAbs === 0) return "bg-muted/40";
  const ratio = Math.min(Math.abs(pnl) / maxAbs, 1);
  const level = Math.max(1, Math.ceil(ratio * 4));
  if (pnl > 0) {
    return ["bg-positive/15", "bg-positive/15", "bg-positive/35", "bg-positive/55", "bg-positive/80"][level];
  }
  return ["bg-negative/15", "bg-negative/15", "bg-negative/35", "bg-negative/55", "bg-negative/80"][level];
}

export function CalendarHeatmap({
  currency,
  monthDate,
  onMonthChange,
  dailyPoints,
  selectedDate,
  onSelectDate,
}: {
  currency: "USD" | "INR";
  monthDate: Date;
  onMonthChange: (date: Date) => void;
  dailyPoints: DailyPnlPoint[];
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}) {
  const pnlByDate = new Map(dailyPoints.map((p) => [p.date, p.pnl]));
  const maxAbs = dailyPoints.reduce((max, p) => Math.max(max, Math.abs(p.pnl)), 0);

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = firstDay.getDay();

  const cells: (string | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month, i + 1);
      return d.toISOString().slice(0, 10);
    }),
  ];

  const symbol = currency === "INR" ? "₹" : "$";

  return (
    <div className="card-elevated rounded-lg border border-border/70 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {currency} calendar
        </h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Previous month"
            onClick={() => onMonthChange(new Date(year, month - 1, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-24 text-center text-xs text-muted-foreground">
            {monthDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Next month"
            onClick={() => onMonthChange(new Date(year, month + 1, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={i}>{w}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const pnl = pnlByDate.get(date);
          const hasTrade = pnl !== undefined;
          return (
            <button
              key={date}
              type="button"
              disabled={!hasTrade}
              onClick={() => onSelectDate(selectedDate === date ? null : date)}
              title={hasTrade ? `${symbol}${pnl!.toFixed(2)}` : undefined}
              className={cn(
                "flex aspect-square items-center justify-center rounded text-[10px] tabular-figures transition-colors",
                hasTrade ? intensityClass(pnl!, maxAbs) : "bg-muted/20 text-muted-foreground",
                selectedDate === date && "ring-2 ring-ring",
                hasTrade && "cursor-pointer",
              )}
            >
              {Number(date.slice(-2))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { monthKey };
