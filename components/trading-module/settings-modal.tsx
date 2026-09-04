"use client";

import * as React from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Market } from "@/db/schema";
import type { SaveSettingsState, TradingSettingsData } from "@/lib/positions/actions";

export function SettingsModal({
  title,
  market,
  settings,
  action,
}: {
  title: string;
  market: Market;
  settings: TradingSettingsData;
  action: (prev: SaveSettingsState, formData: FormData) => Promise<SaveSettingsState>;
}) {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await action({}, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setError(null);
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Settings className="size-4" />
        Settings
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title} Settings</DialogTitle>
        </DialogHeader>

        <SettingsForm
          key={JSON.stringify(settings)}
          market={market}
          settings={settings}
          error={error}
          onSubmit={handleSubmit}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form={`settings-form-${market}`} disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsForm({
  market,
  settings,
  error,
  onSubmit,
}: {
  market: Market;
  settings: TradingSettingsData;
  error: string | null;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const [stopLossType, setStopLossType] = React.useState(settings.stopLossType);
  const [sizingMethod, setSizingMethod] = React.useState(settings.sizingMethod);

  return (
    <form id={`settings-form-${market}`} onSubmit={onSubmit} className="space-y-4">
      <Tabs defaultValue="risk">
        <TabsList className="w-full">
          <TabsTrigger value="risk" className="flex-1">
            Risk Management
          </TabsTrigger>
          <TabsTrigger value="sizing" className="flex-1">
            Position Sizing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="risk" className="grid gap-4 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max Risk Per Trade (%)">
              <Input name="maxRiskPct" type="number" step="0.01" defaultValue={settings.maxRiskPct} />
            </Field>
            <Field label="Max Risk Per Trade (Pips)">
              <Input
                name="maxRiskPips"
                type="number"
                step="0.01"
                defaultValue={settings.maxRiskPips ?? ""}
              />
            </Field>
          </div>
          <Field label="Stop Loss Type">
            <Select
              name="stopLossType"
              value={stopLossType}
              onValueChange={(value) => value && setStopLossType(value)}
            >
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Risk Reward Ratio">
              <Input
                name="riskRewardRatio"
                type="number"
                step="0.1"
                defaultValue={settings.riskRewardRatio}
              />
            </Field>
            <Field label="Partial Booking R-Multiple">
              <Input
                name="partialBookingR"
                type="number"
                step="0.1"
                defaultValue={settings.partialBookingR}
              />
            </Field>
          </div>
        </TabsContent>

        <TabsContent value="sizing" className="grid gap-4 pt-4">
          <Field label="Available Capital">
            <Input
              name="availableCapital"
              type="number"
              step="0.01"
              defaultValue={settings.availableCapital ?? ""}
            />
          </Field>
          <Field label="Position Sizing Method">
            <Select
              name="sizingMethod"
              value={sizingMethod}
              onValueChange={(value) => value && setSizingMethod(value)}
            >
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max Concurrent Positions">
              <Input
                name="maxConcurrentPositions"
                type="number"
                defaultValue={settings.maxConcurrentPositions ?? ""}
              />
            </Field>
            <Field label="Max Positions Per Symbol">
              <Input
                name="maxPositionsPerSymbol"
                type="number"
                defaultValue={settings.maxPositionsPerSymbol}
              />
            </Field>
          </div>
          <Field label="Daily Trade Limit">
            <Input name="dailyTradeLimit" type="number" defaultValue={settings.dailyTradeLimit} />
          </Field>
        </TabsContent>
      </Tabs>

      {error && <p className="text-sm text-negative">{error}</p>}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
