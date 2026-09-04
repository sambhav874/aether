"use client";

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type GroupingMode = "time" | "baskets";

export function GroupingToggle({
  value,
  onChange,
  onNewBasket,
}: {
  value: GroupingMode;
  onChange: (value: GroupingMode) => void;
  onNewBasket?: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
        {(["time", "baskets"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
              value === mode
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {mode}
          </button>
        ))}
      </div>
      {value === "baskets" && onNewBasket && (
        <Button variant="outline" size="sm" onClick={onNewBasket}>
          <Plus className="size-4" />
          New Basket
        </Button>
      )}
    </div>
  );
}
