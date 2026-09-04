"use client";

import { cn } from "@/lib/utils";

export type PositionFilter = "all" | "today" | "last7days" | "most_profitable" | "most_losing";

const FILTERS: { value: PositionFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "last7days", label: "Last 7 Days" },
  { value: "most_profitable", label: "Most Profitable" },
  { value: "most_losing", label: "Most Losing" },
];

export function FilterTabBar({
  value,
  onChange,
  todayCount,
}: {
  value: PositionFilter;
  onChange: (value: PositionFilter) => void;
  todayCount?: number;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
      {FILTERS.map((filter) => (
        <button
          key={filter.value}
          type="button"
          onClick={() => onChange(filter.value)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === filter.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {filter.label}
          {filter.value === "today" && typeof todayCount === "number" && (
            <span
              className={cn(
                "tabular-figures rounded-full px-1.5 text-xs",
                value === filter.value
                  ? "bg-primary-foreground/20"
                  : "bg-background",
              )}
            >
              {todayCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
