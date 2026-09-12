"use client";

import * as React from "react";
import { Download, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { exportRowsToXlsx } from "@/lib/export/xlsx";
import type { PositionRow } from "@/lib/positions/types";
import type { Market } from "@/db/schema";

const MARKET_CURRENCY: Record<Market, "USD" | "INR"> = {
  forex: "USD",
  indian_options: "INR",
  indian_equity: "INR",
};

export function TradeLogPanel({ positions }: { positions: PositionRow[] }) {
  const [search, setSearch] = React.useState("");

  const closed = React.useMemo(
    () =>
      positions
        .filter((p) => p.status === "closed" && p.closedAt)
        .sort((a, b) => b.closedAt!.getTime() - a.closedAt!.getTime()),
    [positions],
  );

  const filtered = React.useMemo(() => {
    if (!search.trim()) return closed;
    const q = search.toLowerCase();
    return closed.filter((p) => p.symbol.toLowerCase().includes(q) || (p.strategyLabel ?? "").toLowerCase().includes(q));
  }, [closed, search]);

  async function handleExport() {
    await exportRowsToXlsx(
      "trade-log",
      "Trades",
      filtered.map((p) => {
        const currency = MARKET_CURRENCY[p.market];
        return {
          Symbol: p.symbol,
          Side: p.side.toUpperCase(),
          "P&L": p.pnl ?? 0,
          "P&L %": p.pnl !== null && p.entryPrice ? ((p.pnl / (p.entryPrice * p.quantity)) * 100).toFixed(2) : "",
          "Date/Time": p.closedAt!.toISOString(),
          Entry: p.entryPrice,
          Exit: p.exitPrice ?? "",
          Size: p.quantity,
          Currency: currency,
        };
      }),
    ).catch((error) => {
      // The export is a file download; a silent no-op looks identical to a
      // slow one, so say something rather than leaving the button dead.
      console.error("[export] xlsx failed —", error);
      window.alert("Export failed. Try again, or narrow the filters if the table is very large.");
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Trade log</h3>
          <p className="text-xs text-muted-foreground">Every fill in the selected window.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search trades..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-48 pl-7 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
            <Download className="size-3.5" /> Excel
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Symbol</th>
              <th className="px-3 py-2 font-medium">Side</th>
              <th className="px-3 py-2 font-medium">P&L</th>
              <th className="px-3 py-2 font-medium">Date / Time</th>
              <th className="px-3 py-2 font-medium">Entry</th>
              <th className="px-3 py-2 font-medium">Exit</th>
              <th className="px-3 py-2 font-medium">Size</th>
              <th className="px-3 py-2 text-right font-medium">P&L %</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No trades match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const currency = MARKET_CURRENCY[p.market];
                const pnlPct = p.pnl !== null && p.entryPrice ? (p.pnl / (p.entryPrice * p.quantity)) * 100 : null;
                return (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{p.symbol}</td>
                    <td className="px-3 py-2 uppercase text-muted-foreground">{p.side}</td>
                    <td
                      className={cn(
                        "tabular-figures px-3 py-2 font-medium",
                        (p.pnl ?? 0) >= 0 ? "text-positive" : "text-negative",
                      )}
                    >
                      {formatMoney(p.pnl, currency)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {p.closedAt!.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="tabular-figures px-3 py-2">{p.entryPrice.toFixed(4)}</td>
                    <td className="tabular-figures px-3 py-2">{p.exitPrice?.toFixed(4) ?? "—"}</td>
                    <td className="tabular-figures px-3 py-2">{p.quantity}</td>
                    <td
                      className={cn(
                        "tabular-figures px-3 py-2 text-right",
                        pnlPct === null ? "text-muted-foreground" : pnlPct >= 0 ? "text-positive" : "text-negative",
                      )}
                    >
                      {pnlPct !== null ? `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%` : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
