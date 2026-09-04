"use client";

import * as React from "react";
import { LineChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { OPTION_CHAIN_INSTRUMENT_LABELS } from "@/lib/options/instruments";
import {
  fetchOptionChainExpiries,
  fetchOptionChain,
  type OptionChainInstrument,
  type OptionChainResult,
  type OptionLeg,
} from "@/lib/options/option-chain-actions";

const INSTRUMENTS = Object.keys(OPTION_CHAIN_INSTRUMENT_LABELS) as OptionChainInstrument[];

function fmt(value: number | undefined, digits = 2): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

const CORE_COLUMNS = ["OI", "Vol", "IV", "Bid", "Ask", "LTP"] as const;
const GREEK_COLUMNS = ["Delta", "Theta", "Gamma"] as const;

function legValue(leg: OptionLeg, column: (typeof CORE_COLUMNS)[number] | (typeof GREEK_COLUMNS)[number]): string {
  switch (column) {
    case "OI":
      return fmt(leg.oi, 0);
    case "Vol":
      return fmt(leg.volume, 0);
    case "IV":
      return fmt(leg.iv, 1);
    case "Bid":
      return fmt(leg.bid);
    case "Ask":
      return fmt(leg.ask);
    case "LTP":
      return fmt(leg.ltp);
    case "Delta":
      return fmt(leg.delta, 3);
    case "Theta":
      return fmt(leg.theta, 3);
    case "Gamma":
      return fmt(leg.gamma, 4);
  }
}

function LegCells({
  leg,
  columns,
  side,
  maxOi,
  itmShade,
}: {
  leg: OptionLeg | null;
  columns: readonly string[];
  side: "ce" | "pe";
  maxOi: number;
  itmShade: boolean;
}) {
  return (
    <>
      {columns.map((column) => {
        if (column === "OI") {
          const pct = leg && maxOi > 0 ? Math.min(100, (leg.oi / maxOi) * 100) : 0;
          return (
            <td
              key={column}
              className={cn("relative px-2 py-1.5 text-right tabular-figures font-medium", itmShade && (side === "ce" ? "bg-positive/5" : "bg-negative/5"))}
            >
              <span
                className={cn("absolute inset-y-0.5 rounded-sm", side === "ce" ? "right-0 bg-positive/10" : "left-0 bg-negative/10")}
                style={{ width: `${pct}%` }}
                aria-hidden
              />
              <span className="relative">{leg ? fmt(leg.oi, 0) : "—"}</span>
            </td>
          );
        }
        return (
          <td
            key={column}
            className={cn(
              "px-2 py-1.5 text-right tabular-figures",
              column === "LTP" && "font-medium",
              !leg && "text-muted-foreground",
              itmShade && (side === "ce" ? "bg-positive/5" : "bg-negative/5"),
            )}
          >
            {leg ? legValue(leg, column as (typeof CORE_COLUMNS)[number] | (typeof GREEK_COLUMNS)[number]) : "—"}
          </td>
        );
      })}
    </>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  labels,
  onChange,
}: {
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            value === opt ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {labels[opt]}
        </button>
      ))}
    </div>
  );
}

export function OptionChainModal() {
  const [open, setOpen] = React.useState(false);
  const [instrument, setInstrument] = React.useState<OptionChainInstrument>("NIFTY");
  const [expiry, setExpiry] = React.useState<string | null>(null);
  const [expiries, setExpiries] = React.useState<string[] | null>(null);
  const [expiryError, setExpiryError] = React.useState<string | null>(null);
  const [chain, setChain] = React.useState<OptionChainResult | null>(null);
  const [showGreeks, setShowGreeks] = React.useState(false);
  const [pendingExpiries, startExpiriesTransition] = React.useTransition();
  const [pendingChain, startChainTransition] = React.useTransition();
  const loading = pendingExpiries || pendingChain;

  React.useEffect(() => {
    if (!open) return;
    startExpiriesTransition(async () => {
      const result = await fetchOptionChainExpiries(instrument);
      if (result.status === "ok") {
        setExpiries(result.expiries);
        setExpiry(result.expiries[0] ?? null);
        setExpiryError(null);
      } else {
        setExpiries(null);
        setExpiry(null);
        setExpiryError(result.reason);
      }
    });
  }, [open, instrument, startExpiriesTransition]);

  React.useEffect(() => {
    if (!open || !expiry) return;
    startChainTransition(async () => {
      const result = await fetchOptionChain(instrument, expiry);
      setChain(result);
    });
  }, [open, instrument, expiry, startChainTransition]);

  const ceColumns: readonly string[] = showGreeks
    ? ["OI", "Vol", "IV", ...GREEK_COLUMNS, "Bid", "Ask", "LTP"]
    : CORE_COLUMNS;
  const peColumns: readonly string[] = [...ceColumns].reverse();

  const maxOi = chain?.status === "ok" ? Math.max(1, ...chain.strikes.flatMap((s) => [s.ce?.oi ?? 0, s.pe?.oi ?? 0])) : 1;
  const atmStrike =
    chain?.status === "ok" && chain.strikes.length > 0
      ? chain.strikes.reduce((closest, row) =>
          Math.abs(row.strike - chain.underlyingPrice) < Math.abs(closest.strike - chain.underlyingPrice) ? row : closest,
        ).strike
      : null;
  const pcr = chain?.status === "ok" && chain.totals.ceOi > 0 ? chain.totals.peOi / chain.totals.ceOi : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <LineChart className="size-4" />
        Option Chain
      </Button>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Option Chain</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl
              value={instrument}
              options={INSTRUMENTS}
              labels={OPTION_CHAIN_INSTRUMENT_LABELS}
              onChange={setInstrument}
            />
            {expiries && expiries.length > 0 && (
              <SegmentedControl
                value={expiry ?? expiries[0]}
                options={expiries}
                labels={Object.fromEntries(expiries.map((e) => [e, e]))}
                onChange={setExpiry}
              />
            )}
          </div>
          <div className="flex items-center gap-3">
            {chain?.status === "ok" && (
              <span className="font-mono text-sm">
                <span className="text-muted-foreground">{OPTION_CHAIN_INSTRUMENT_LABELS[instrument]}:</span>{" "}
                <span className="font-semibold">{fmt(chain.underlyingPrice)}</span>
              </span>
            )}
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch size="sm" checked={showGreeks} onCheckedChange={setShowGreeks} />
              Greeks
            </label>
          </div>
        </div>

        {expiryError && (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="font-medium">Option chain unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">{expiryError}</p>
          </div>
        )}

        {!expiryError && loading && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Loading strike ladder…
          </div>
        )}

        {!expiryError && !loading && chain?.status === "unavailable" && (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="font-medium">Option chain unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">{chain.reason}</p>
          </div>
        )}

        {!expiryError && !loading && chain?.status === "ok" && (
          <div className="max-h-[60vh] overflow-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur text-muted-foreground">
                <tr>
                  <th colSpan={ceColumns.length} className="px-2 py-1.5 text-center font-medium text-positive">
                    CALLS
                  </th>
                  <th className="bg-muted px-2 py-1.5 text-center font-medium">Strike</th>
                  <th colSpan={peColumns.length} className="px-2 py-1.5 text-center font-medium text-negative">
                    PUTS
                  </th>
                </tr>
                <tr className="border-t">
                  {ceColumns.map((h) => (
                    <th key={`ce-${h}`} className="px-2 py-1 text-right font-medium">
                      {h}
                    </th>
                  ))}
                  <th className="bg-muted/80 px-2 py-1 text-center font-medium">—</th>
                  {peColumns.map((h) => (
                    <th key={`pe-${h}`} className="px-2 py-1 text-right font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chain.strikes.map((row) => {
                  const isAtm = row.strike === atmStrike;
                  const isCallItm = row.strike < chain.underlyingPrice;
                  const isPutItm = row.strike > chain.underlyingPrice;
                  return (
                    <tr
                      key={row.strike}
                      className={cn(
                        "border-t hover:bg-muted/30",
                        isAtm && "border-y-2 border-y-foreground/40 bg-muted/20",
                      )}
                    >
                      <LegCells leg={row.ce} columns={ceColumns} side="ce" maxOi={maxOi} itmShade={isCallItm} />
                      <td
                        className={cn(
                          "bg-muted/40 px-2 py-1.5 text-center font-semibold",
                          isAtm && "bg-muted text-foreground",
                        )}
                      >
                        {row.strike}
                      </td>
                      <LegCells leg={row.pe} columns={peColumns} side="pe" maxOi={maxOi} itmShade={isPutItm} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!expiryError && !loading && chain?.status === "ok" && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              Total OI — Calls <span className="font-medium text-foreground">{fmt(chain.totals.ceOi, 0)}</span> · Puts{" "}
              <span className="font-medium text-foreground">{fmt(chain.totals.peOi, 0)}</span>
            </span>
            <span>
              Total Volume — Calls <span className="font-medium text-foreground">{fmt(chain.totals.ceVolume, 0)}</span> ·
              Puts <span className="font-medium text-foreground">{fmt(chain.totals.peVolume, 0)}</span>
            </span>
            {pcr !== null && (
              <span>
                PCR <span className="font-medium text-foreground">{fmt(pcr, 2)}</span>
              </span>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
