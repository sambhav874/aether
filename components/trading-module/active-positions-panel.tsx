"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PositionRow } from "@/lib/positions/types";
import type { ClosePositionsResult } from "@/lib/positions/actions";
import { formatMoney } from "@/lib/format";

export function ActivePositionsPanel({
  positions,
  currency,
  closeAction,
}: {
  positions: PositionRow[];
  currency: "USD" | "INR";
  closeAction: (ids: string[]) => Promise<ClosePositionsResult>;
}) {
  const open = React.useMemo(() => positions.filter((p) => p.status === "open"), [positions]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  // Positions close (or fall out of `positions` entirely) after a revalidate,
  // so intersect against the current open set at render time rather than
  // syncing `selected` itself — no effect needed to prune stale ids.
  const selectable = React.useMemo(() => {
    const openIds = new Set(open.map((p) => p.id));
    return new Set(Array.from(selected).filter((id) => openIds.has(id)));
  }, [selected, open]);

  if (open.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        No open positions right now.
      </div>
    );
  }

  const floatingPnl = open.reduce((sum, p) => sum + (p.pnl ?? 0), 0);
  const gainers = open.filter((p) => (p.pnl ?? 0) > 0).length;
  const losers = open.filter((p) => (p.pnl ?? 0) < 0).length;
  const exposure = open.reduce((sum, p) => sum + p.quantity, 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(selectable.size === open.length ? new Set() : new Set(open.map((p) => p.id)));
  }

  function handleClose() {
    setError(null);
    const ids = Array.from(selectable);
    startTransition(async () => {
      const result = await closeAction(ids);
      if (result.failed.length > 0) {
        setError(`${result.closed} closed, ${result.failed.length} failed: ${result.failed.join("; ")}`);
      }
      setSelected(new Set());
    });
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Active Positions</h2>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            Floating P&L{" "}
            <span
              className={cn(
                "tabular-figures font-semibold",
                floatingPnl >= 0 ? "text-positive" : "text-negative",
              )}
            >
              {(() => {
                const currencies = new Set(positions.map((p) => p.currency));
                return currencies.size > 1 ? "mixed" : formatMoney(floatingPnl, [...currencies][0] ?? currency);
              })()}
            </span>
          </span>
          <span className="text-muted-foreground">
            <span className="text-positive font-semibold">{gainers}</span> up /{" "}
            <span className="text-negative font-semibold">{losers}</span> down
          </span>
          <span className="text-muted-foreground">
            Exposure <span className="tabular-figures font-semibold">{exposure}</span> lots
          </span>
        </div>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={selectable.size === open.length}
                  onChange={toggleAll}
                  className="size-4"
                />
              </th>
              <th className="px-3 py-2 font-medium">Symbol</th>
              <th className="px-3 py-2 font-medium">Side</th>
              <th className="px-3 py-2 font-medium">Quantity</th>
              <th className="px-3 py-2 font-medium">Entry</th>
              <th className="px-3 py-2 font-medium">Floating P&L</th>
            </tr>
          </thead>
          <tbody>
            {open.map((position) => (
              <tr key={position.id} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectable.has(position.id)}
                    onChange={() => toggle(position.id)}
                    className="size-4"
                  />
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-medium">{position.symbol}</td>
                <td className="px-3 py-2">
                  <Badge variant={position.side === "long" ? "default" : "destructive"}>
                    {position.side === "long" ? "LONG" : "SHORT"}
                  </Badge>
                </td>
                <td className="tabular-figures px-3 py-2">{position.quantity}</td>
                <td className="tabular-figures px-3 py-2">{position.entryPrice.toFixed(4)}</td>
                <td
                  className={cn(
                    "tabular-figures px-3 py-2 font-medium",
                    (position.pnl ?? 0) >= 0 ? "text-positive" : "text-negative",
                  )}
                >
                  {formatMoney(position.pnl, position.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <Button
          variant="destructive"
          size="sm"
          disabled={selectable.size === 0 || pending}
          onClick={handleClose}
        >
          {pending ? "Closing…" : `Close ${selectable.size > 0 ? selectable.size : ""} selected`}
        </Button>
      </div>
    </div>
  );
}
