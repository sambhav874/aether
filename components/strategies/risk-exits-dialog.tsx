"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { updateStrategyRisk, updateStrategyExitRules } from "@/lib/strategies/detail-actions";
import type { StrategyRiskSettings, TrailingRuleRow, PartialRuleRow } from "@/lib/strategies/types";

type TrailingType = TrailingRuleRow["trailingType"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function InheritedInput({
  value,
  onChange,
  placeholder,
  step,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  step?: string;
}) {
  return (
    <Input
      type="number"
      step={step ?? "0.01"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ? `${placeholder} (inherited)` : "inherited"}
    />
  );
}

export function RiskExitsDialog({
  strategyId,
  strategyName,
  initial,
  workspaceDefaults,
  trailingRules: initialTrailing,
  partialRules: initialPartial,
  open,
  onOpenChange,
}: {
  strategyId: string;
  strategyName: string;
  initial: StrategyRiskSettings | null;
  workspaceDefaults: StrategyRiskSettings | null;
  trailingRules: TrailingRuleRow[];
  partialRules: PartialRuleRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [risk, setRisk] = React.useState<Record<string, string>>({
    totalCapital: initial?.totalCapital?.toString() ?? "",
    availableCapital: initial?.availableCapital?.toString() ?? "",
    maxConcurrentPositions: initial?.maxConcurrentPositions?.toString() ?? "",
    maxPositionsPerSymbol: initial?.maxPositionsPerSymbol?.toString() ?? "",
    dailyTradeLimit: initial?.dailyTradeLimit?.toString() ?? "",
    maxRiskPct: initial?.maxRiskPct?.toString() ?? "",
    maxRiskPips: initial?.maxRiskPips?.toString() ?? "",
    defaultStopLossPct: initial?.defaultStopLossPct?.toString() ?? "",
    riskRewardRatio: initial?.riskRewardRatio?.toString() ?? "",
    partialBookingR: initial?.partialBookingR?.toString() ?? "",
  });
  const [sizingMethod, setSizingMethod] = React.useState(initial?.sizingMethod ?? workspaceDefaults?.sizingMethod ?? "FIXED_PERCENTAGE");
  const [stopLossType, setStopLossType] = React.useState(initial?.stopLossType ?? workspaceDefaults?.stopLossType ?? "PERCENTAGE");
  const [allowSameSide, setAllowSameSide] = React.useState(initial?.allowMultipleSameSide ?? false);

  const [trailing, setTrailing] = React.useState(initialTrailing.map((r) => ({ rrLevel: r.rrLevel.toString(), trailingType: r.trailingType })));
  const [partial, setPartial] = React.useState(initialPartial.map((r) => ({ rrLevel: r.rrLevel.toString(), exitPct: r.exitPct.toString() })));

  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function set(key: string, value: string) {
    setRisk((prev) => ({ ...prev, [key]: value }));
  }

  function handleSaveRisk() {
    setError(null);
    startTransition(async () => {
      const n = (v: string) => (v.trim() ? Number(v) : undefined);
      const result = await updateStrategyRisk(strategyId, {
        sizingMethod: sizingMethod as StrategyRiskSettings["sizingMethod"],
        stopLossType: stopLossType as StrategyRiskSettings["stopLossType"],
        allowMultipleSameSide: allowSameSide,
        totalCapital: n(risk.totalCapital),
        availableCapital: n(risk.availableCapital),
        maxConcurrentPositions: n(risk.maxConcurrentPositions),
        maxPositionsPerSymbol: n(risk.maxPositionsPerSymbol),
        dailyTradeLimit: n(risk.dailyTradeLimit),
        maxRiskPct: n(risk.maxRiskPct),
        maxRiskPips: n(risk.maxRiskPips),
        defaultStopLossPct: n(risk.defaultStopLossPct),
        riskRewardRatio: n(risk.riskRewardRatio),
        partialBookingR: n(risk.partialBookingR),
      });
      if (result.error) setError(result.error);
    });
  }

  function handleSaveExits() {
    setError(null);
    const trailingParsed = trailing
      .filter((r) => r.rrLevel.trim())
      .map((r, i) => ({ rrLevel: Number(r.rrLevel), trailingType: r.trailingType, sortOrder: i }));
    const partialParsed = partial
      .filter((r) => r.rrLevel.trim())
      .map((r, i) => ({ rrLevel: Number(r.rrLevel), exitPct: Number(r.exitPct), sortOrder: i }));
    startTransition(async () => {
      const result = await updateStrategyExitRules(strategyId, trailingParsed, partialParsed);
      if (result.error) setError(result.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Risk & exits — {strategyName}</DialogTitle>
          <DialogDescription>Risk, sizing, and exit rules for this strategy.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="risk">
          <TabsList className="w-full">
            <TabsTrigger value="risk" className="flex-1">
              Risk & Sizing
            </TabsTrigger>
            <TabsTrigger value="exits" className="flex-1">
              Exit Rules
            </TabsTrigger>
          </TabsList>

          <TabsContent value="risk" className="max-h-[26rem] space-y-4 overflow-y-auto pt-3 pr-1">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">Position sizing</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Total capital">
                  <InheritedInput value={risk.totalCapital} onChange={(v) => set("totalCapital", v)} />
                </Field>
                <Field label="Available capital">
                  <InheritedInput
                    value={risk.availableCapital}
                    onChange={(v) => set("availableCapital", v)}
                    placeholder={workspaceDefaults?.availableCapital?.toString()}
                  />
                </Field>
              </div>
              <div className="mt-3">
                <Field label="Sizing method">
                  <Select value={sizingMethod ?? undefined} onValueChange={(v) => v && setSizingMethod(v as typeof sizingMethod)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIXED_PERCENTAGE">FIXED_PERCENTAGE</SelectItem>
                      <SelectItem value="FIXED_QUANTITY">FIXED_QUANTITY</SelectItem>
                      <SelectItem value="FIXED_RISK_AMOUNT">FIXED_RISK_AMOUNT</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Max concurrent positions">
                  <InheritedInput
                    step="1"
                    value={risk.maxConcurrentPositions}
                    onChange={(v) => set("maxConcurrentPositions", v)}
                    placeholder={workspaceDefaults?.maxConcurrentPositions?.toString()}
                  />
                </Field>
                <Field label="Max positions per symbol">
                  <InheritedInput
                    step="1"
                    value={risk.maxPositionsPerSymbol}
                    onChange={(v) => set("maxPositionsPerSymbol", v)}
                    placeholder={workspaceDefaults?.maxPositionsPerSymbol?.toString()}
                  />
                </Field>
              </div>
              <div className="mt-3">
                <Field label="Daily trade limit">
                  <InheritedInput
                    step="1"
                    value={risk.dailyTradeLimit}
                    onChange={(v) => set("dailyTradeLimit", v)}
                    placeholder={workspaceDefaults?.dailyTradeLimit?.toString()}
                  />
                </Field>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Allow multiple trades on same side</p>
                  <p className="text-xs text-muted-foreground">
                    If disabled, only one BUY and one SELL can be active per symbol.
                  </p>
                </div>
                <Switch checked={allowSameSide} onCheckedChange={setAllowSameSide} />
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">Risk & stops</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Max risk per trade (%)">
                  <InheritedInput
                    value={risk.maxRiskPct}
                    onChange={(v) => set("maxRiskPct", v)}
                    placeholder={workspaceDefaults?.maxRiskPct?.toString()}
                  />
                </Field>
                <Field label="Max risk per trade (pips)">
                  <InheritedInput
                    value={risk.maxRiskPips}
                    onChange={(v) => set("maxRiskPips", v)}
                    placeholder={workspaceDefaults?.maxRiskPips?.toString()}
                  />
                </Field>
              </div>
              <div className="mt-3">
                <Field label="Stop loss type">
                  <Select value={stopLossType ?? undefined} onValueChange={(v) => v && setStopLossType(v as typeof stopLossType)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERCENTAGE">PERCENTAGE</SelectItem>
                      <SelectItem value="PIPS">PIPS</SelectItem>
                      <SelectItem value="PRICE">PRICE</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="mt-3">
                <Field label="Default stop loss (%)">
                  <InheritedInput value={risk.defaultStopLossPct} onChange={(v) => set("defaultStopLossPct", v)} />
                </Field>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Risk reward ratio">
                  <InheritedInput
                    value={risk.riskRewardRatio}
                    onChange={(v) => set("riskRewardRatio", v)}
                    placeholder={workspaceDefaults?.riskRewardRatio?.toString()}
                  />
                </Field>
                <Field label="Partial booking R-multiple">
                  <InheritedInput
                    value={risk.partialBookingR}
                    onChange={(v) => set("partialBookingR", v)}
                    placeholder={workspaceDefaults?.partialBookingR?.toString()}
                  />
                </Field>
              </div>
            </div>

            {error && <p className="text-sm text-negative">{error}</p>}
            <Button className="w-full" onClick={handleSaveRisk} disabled={pending}>
              {pending ? "Saving…" : "Save risk & sizing"}
            </Button>
          </TabsContent>

          <TabsContent value="exits" className="max-h-[26rem] space-y-5 overflow-y-auto pt-3 pr-1">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase">Trailing stop rules</p>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setTrailing((prev) => [...prev, { rrLevel: "1", trailingType: "ATR" }])}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <p className="mb-2 text-xs text-muted-foreground">Configure trailing stop type at different R:R levels.</p>
              <div className="space-y-1.5">
                {trailing.map((rule, i) => (
                  <div key={i} className="flex items-center gap-1.5 rounded-lg border p-2">
                    <Input
                      type="number"
                      step="0.1"
                      value={rule.rrLevel}
                      onChange={(e) =>
                        setTrailing((prev) => prev.map((r, idx) => (idx === i ? { ...r, rrLevel: e.target.value } : r)))
                      }
                      className="h-7 w-16 text-xs"
                      placeholder="R:R"
                    />
                    <Select
                      value={rule.trailingType}
                      onValueChange={(v) =>
                        v && setTrailing((prev) => prev.map((r, idx) => (idx === i ? { ...r, trailingType: v as TrailingType } : r)))
                      }
                    >
                      <SelectTrigger size="sm" className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EMA">EMA</SelectItem>
                        <SelectItem value="ATR">ATR</SelectItem>
                        <SelectItem value="LAST_4_CANDLES">LAST 4 CANDLES</SelectItem>
                        <SelectItem value="LAST_CANDLE">LAST CANDLE</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setTrailing((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase">Partial booking rules</p>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setPartial((prev) => [...prev, { rrLevel: "1", exitPct: "50" }])}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <p className="mb-2 text-xs text-muted-foreground">Configure partial exit percentages at different R:R levels.</p>
              <div className="space-y-1.5">
                {partial.map((rule, i) => (
                  <div key={i} className="flex items-center gap-1.5 rounded-lg border p-2">
                    <Input
                      type="number"
                      step="0.1"
                      value={rule.rrLevel}
                      onChange={(e) =>
                        setPartial((prev) => prev.map((r, idx) => (idx === i ? { ...r, rrLevel: e.target.value } : r)))
                      }
                      className="h-7 w-16 text-xs"
                      placeholder="R:R"
                    />
                    <Input
                      type="number"
                      step="1"
                      value={rule.exitPct}
                      onChange={(e) =>
                        setPartial((prev) => prev.map((r, idx) => (idx === i ? { ...r, exitPct: e.target.value } : r)))
                      }
                      className="h-7 flex-1 text-xs"
                      placeholder="Exit %"
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setPartial((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-negative">{error}</p>}
            <Button className="w-full" onClick={handleSaveExits} disabled={pending}>
              {pending ? "Saving…" : "Save exit rules"}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
