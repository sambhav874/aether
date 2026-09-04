"use client";

import * as React from "react";
import { Plus } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveStrategy, type SaveStrategyState } from "@/lib/strategies/actions";
import type { Market } from "@/db/schema";
import type { StrategyRow } from "@/lib/strategies/types";
import type { LinkableAccount } from "@/lib/strategies/accounts";

const MARKET_LABEL: Record<Market, string> = {
  forex: "Forex",
  indian_options: "Indian Options",
  indian_equity: "Indian Equity",
};

const HANDLE_TYPE_LABEL: Record<StrategyRow["handleType"], string> = {
  AUTO: "Auto — dispatch immediately, stop loss from risk%",
  MANUAL: "Manual — hold for confirmation before dispatching",
  BY_STRATEGY: "By strategy — dispatch immediately, no stop loss calc",
};

const PROVIDER_LABEL: Record<LinkableAccount["provider"], string> = {
  metaapi: "Bridge (MT5)",
  zerodha: "Zerodha",
  dhan: "Dhan",
  motilal: "Motilal Oswal",
};

export function StrategyFormDialog({
  strategy,
  accounts = [],
  linkedAccountIds = [],
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  accounts?: LinkableAccount[];
  linkedAccountIds?: string[];
  strategy?: Pick<
    StrategyRow,
    | "id"
    | "name"
    | "market"
    | "slug"
    | "description"
    | "handleType"
    | "defaultSymbol"
    | "coolDownPeriod"
    | "maxTriggersPerDay"
    | "isGlobal"
  >;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const controlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlled ? openProp : internalOpen;
  const setOpen = controlled ? (onOpenChangeProp ?? (() => {})) : setInternalOpen;
  const [error, setError] = React.useState<string | null>(null);
  const [market, setMarket] = React.useState<Market>(strategy?.market ?? "forex");
  const [handleType, setHandleType] = React.useState<StrategyRow["handleType"]>(strategy?.handleType ?? "AUTO");
  const [pending, startTransition] = React.useTransition();

  // Same rule the Linked accounts dialog uses — a disconnected account can be
  // checked but its orders would fail, so it isn't offered.
  const connectable = accounts.filter((a) => a.status === "connected");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result: SaveStrategyState = await saveStrategy(strategy?.id ?? null, {}, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setError(null);
        setOpen(false);
      }
    });
  }

  return (
    <Dialog key={strategy?.id ?? "new"} open={open} onOpenChange={setOpen}>
      {!controlled && (
        <DialogTrigger render={<Button size="sm" />}>
          <Plus className="size-4" />
          Configure new strategy
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{strategy ? "Edit strategy" : "Configure new strategy"}</DialogTitle>
        </DialogHeader>

        <form id="strategy-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input name="name" defaultValue={strategy?.name} placeholder="e.g. Manthan | XAUUSD" required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Webhook Slug</Label>
            <Input
              name="slug"
              defaultValue={strategy?.slug}
              placeholder="auto-generated from name if left blank"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Market</Label>
              <Select name="market" value={market} onValueChange={(value) => value && setMarket(value as Market)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: Market) => MARKET_LABEL[v]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MARKET_LABEL) as Market[]).map((m) => (
                    <SelectItem key={m} value={m}>
                      {MARKET_LABEL[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Default Symbol</Label>
              <Input name="defaultSymbol" defaultValue={strategy?.defaultSymbol ?? ""} placeholder="optional" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Handle Type</Label>
            <Select
              name="handleType"
              value={handleType}
              onValueChange={(value) => value && setHandleType(value as StrategyRow["handleType"])}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{(v: StrategyRow["handleType"]) => HANDLE_TYPE_LABEL[v]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(HANDLE_TYPE_LABEL) as StrategyRow["handleType"][]).map((h) => (
                  <SelectItem key={h} value={h}>
                    {HANDLE_TYPE_LABEL[h]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Input name="description" defaultValue={strategy?.description ?? ""} placeholder="optional" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Broker accounts</Label>
            {/*
              Marks the picker as present so saveStrategy can tell "user cleared
              every account" apart from "this form had no picker" — an unchecked
              checkbox group submits nothing either way.
            */}
            <input type="hidden" name="accountsFieldPresent" value="1" />
            {connectable.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                No connected broker accounts yet — connect one in Settings &rsaquo; Integrations.
                You can link accounts later.
              </p>
            ) : (
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border p-2">
                {connectable.map((account) => (
                  <label
                    key={account.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      name="accountIds"
                      value={account.id}
                      defaultChecked={linkedAccountIds.includes(account.id)}
                      className="size-4"
                    />
                    <span className="font-medium">{account.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {PROVIDER_LABEL[account.provider]}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Signals dispatch to every account checked here.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Cooldown (seconds)</Label>
              <Input
                name="coolDownPeriod"
                type="number"
                min={0}
                defaultValue={strategy?.coolDownPeriod ?? ""}
                placeholder="none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Max triggers / day</Label>
              <Input
                name="maxTriggersPerDay"
                type="number"
                min={1}
                defaultValue={strategy?.maxTriggersPerDay ?? ""}
                placeholder="unlimited"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isGlobal"
              defaultChecked={strategy?.isGlobal ?? false}
              className="size-4"
            />
            Global strategy
            <span className="text-xs text-muted-foreground">(display/filter only — not yet enforced)</span>
          </label>
          {error && <p className="text-sm text-negative">{error}</p>}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="strategy-form" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
