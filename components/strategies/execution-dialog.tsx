"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { updateStrategyExecution } from "@/lib/strategies/detail-actions";
import type { CopierAccount } from "@/lib/strategies/types";

export function ExecutionDialog({
  strategyId,
  strategyName,
  initialMaxTriggersPerDay,
  initialPaperTrading,
  copiers: initialCopiers,
  open,
  onOpenChange,
}: {
  strategyId: string;
  strategyName: string;
  initialMaxTriggersPerDay: number | null;
  initialPaperTrading: boolean;
  copiers: CopierAccount[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [maxPerDay, setMaxPerDay] = React.useState(initialMaxTriggersPerDay?.toString() ?? "");
  const [paperTrading, setPaperTrading] = React.useState(initialPaperTrading);
  const [copiers, setCopiers] = React.useState(initialCopiers);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function handleSave() {
    setError(null);
    const value = maxPerDay.trim() ? Number(maxPerDay) : null;
    startTransition(async () => {
      const result = await updateStrategyExecution(strategyId, {
        maxTriggersPerDay: value,
        paperTrading,
        copiers: copiers.map((c) => ({ accountId: c.accountId, multiplier: c.multiplier, enabled: c.enabled })),
      });
      if (result.error) setError(result.error);
      else onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Execution — {strategyName}</DialogTitle>
          <DialogDescription>
            Where this strategy&rsquo;s signals get executed, how many per day, and whether they&rsquo;re real or
            simulated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label className="text-xs">Max triggers / day</Label>
          <Input
            type="number"
            min={1}
            placeholder="Unlimited"
            value={maxPerDay}
            onChange={(e) => setMaxPerDay(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Hard cap on signals accepted per calendar day. Leave blank for unlimited.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Paper trading</p>
            <p className="text-xs text-muted-foreground">
              When enabled, positions from this strategy are simulated only (no real broker orders).
            </p>
          </div>
          <Switch checked={paperTrading} onCheckedChange={setPaperTrading} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Copier accounts</Label>
          <p className="text-xs text-muted-foreground">
            Every account you switch on opens its own position from each signal. The multiplier scales that
            account&rsquo;s size against what the strategy calculated — 1 is the same size, 0.5 is half, 2 is
            double.
          </p>
          {copiers.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              No linked accounts yet — link accounts from the strategy row first.
            </p>
          ) : (
            <div className="max-h-48 space-y-1.5 overflow-y-auto">
              {copiers.map((c) => (
                <div key={c.accountId} className="flex items-center gap-2 rounded-lg border p-2">
                  <Switch
                    checked={c.enabled}
                    onCheckedChange={(checked) =>
                      setCopiers((prev) => prev.map((p) => (p.accountId === c.accountId ? { ...p, enabled: checked } : p)))
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.label}</p>
                    <p className="text-xs text-muted-foreground">{c.provider}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <X className="size-3 text-muted-foreground" />
                    <Input
                      type="number"
                      step="0.1"
                      min="0.01"
                      value={c.multiplier}
                      onChange={(e) =>
                        setCopiers((prev) =>
                          prev.map((p) =>
                            p.accountId === c.accountId ? { ...p, multiplier: Number(e.target.value) } : p,
                          ),
                        )
                      }
                      className="h-7 w-16 text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-negative">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
