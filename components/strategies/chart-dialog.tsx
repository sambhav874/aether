"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TradingViewAdvancedChart } from "@/components/charts/tradingview-advanced-chart";
import { updateStrategyChart } from "@/lib/strategies/detail-actions";
import { useToast } from "@/components/providers/toast-provider";

const INTERVALS = ["1", "5", "15", "60", "240", "D", "W"];

export function ChartDialog({
  strategyId,
  strategyName,
  defaultSymbol,
  initialSymbol,
  initialInterval,
  open,
  onOpenChange,
}: {
  strategyId: string;
  strategyName: string;
  defaultSymbol: string | null;
  initialSymbol: string | null;
  initialInterval: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toast = useToast();
  const [symbol, setSymbol] = React.useState(initialSymbol ?? defaultSymbol ?? "EURUSD");
  const [interval, setInterval] = React.useState(initialInterval ?? "60");
  const [pending, startTransition] = React.useTransition();

  function handleSave() {
    startTransition(async () => {
      toast.report(await updateStrategyChart(strategyId, { chartSymbol: symbol || null, chartInterval: interval }), "Chart saved");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Chart — {strategyName}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Symbol</Label>
            <Input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Interval</Label>
            <div className="flex gap-1">
              {INTERVALS.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setInterval(i)}
                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                    interval === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>
        </div>

        <TradingViewAdvancedChart symbol={symbol} height={440} />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Saving…" : "Save chart settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
