"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronRight, LineChart, ExternalLink, StickyNote, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  POSITION_COLUMNS,
  type PositionColumn,
} from "@/components/trading-module/column-visibility-menu";
import type { PositionRow } from "@/lib/positions/types";
import { EmptyState } from "@/components/trading-module/empty-state";
import { formatMoney } from "@/lib/format";
import { useAppearance } from "@/components/providers/appearance-provider";
import { getPositionExecutions, getPositionNotes, addPositionNote, type ExecutionRow, type NoteRow } from "@/lib/positions/actions";
import { getBrokerDashboardUrl } from "@/lib/positions/broker-links";
import type { GroupingMode } from "@/components/trading-module/grouping-toggle";

function formatSince(date: Date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTimeInTrade(openedAt: Date, closedAt: Date | null) {
  const end = closedAt ?? new Date();
  const ms = end.getTime() - openedAt.getTime();
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return `${Math.round(ms / (1000 * 60))} min`;
  if (hours < 24) return `${hours.toFixed(1)} hrs`;
  return `${(hours / 24).toFixed(1)} days`;
}

function points(position: PositionRow): number | null {
  if (position.exitPrice === null) return null;
  const delta = position.exitPrice - position.entryPrice;
  return position.side === "long" ? delta : -delta;
}

function formatPoints(value: number | null) {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(4)}`;
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dayLabel(key: string) {
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86400000));
  if (key === today) return "TODAY";
  if (key === yesterday) return "YESTERDAY";
  return new Date(key).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function ExecutionsPanel({
  positionId,
  provider,
  symbol,
  currency,
}: {
  positionId: string;
  provider: string;
  symbol: string;
  currency: "USD" | "INR";
}) {
  const { motion: appearanceMotion } = useAppearance();
  const reduced = appearanceMotion === "reduced";
  const [executions, setExecutions] = React.useState<ExecutionRow[] | null>(null);
  const [notes, setNotes] = React.useState<NoteRow[] | null>(null);
  const [draft, setDraft] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const refreshNotes = React.useCallback(() => {
    getPositionNotes(positionId).then(setNotes);
  }, [positionId]);

  React.useEffect(() => {
    getPositionExecutions(positionId).then(setExecutions);
    refreshNotes();
  }, [positionId, refreshNotes]);

  const dashboardUrl = getBrokerDashboardUrl(provider as Parameters<typeof getBrokerDashboardUrl>[0]);

  function submitNote() {
    if (!draft.trim()) return;
    startTransition(async () => {
      await addPositionNote(positionId, draft);
      setDraft("");
      refreshNotes();
    });
  }

  return (
    <motion.div
      initial={reduced ? undefined : { height: 0, opacity: 0 }}
      animate={reduced ? undefined : { height: "auto", opacity: 1 }}
      exit={reduced ? undefined : { height: 0, opacity: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden bg-muted/20"
    >
      <div className="space-y-3 p-3">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase">
            Executions {executions ? `· ${executions.length} fills` : ""}
          </p>
          {executions === null ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : executions.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
              No recorded fills yet — the broker sync reconciles this once it runs.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border bg-background">
              <table className="w-full text-xs">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="px-2.5 py-1.5 font-medium">Time</th>
                    <th className="px-2.5 py-1.5 font-medium">Type</th>
                    <th className="px-2.5 py-1.5 font-medium">Side</th>
                    <th className="px-2.5 py-1.5 font-medium">Qty</th>
                    <th className="px-2.5 py-1.5 font-medium">Price</th>
                    <th className="px-2.5 py-1.5 font-medium">Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-2.5 py-1.5">
                        {e.occurredAt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-2.5 py-1.5">
                        <Badge variant={e.type === "bought" ? "default" : "destructive"} className="text-[10px]">
                          {e.type.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-2.5 py-1.5 uppercase">{e.side}</td>
                      <td className="tabular-figures px-2.5 py-1.5">{e.quantity}</td>
                      <td className="tabular-figures px-2.5 py-1.5">{e.price.toFixed(4)}</td>
                      <td className="tabular-figures px-2.5 py-1.5">{formatMoney(e.fee, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {notes && notes.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase">Notes</p>
            {notes.map((n) => (
              <div key={n.id} className="rounded-md border bg-background p-2 text-xs">
                <p>{n.body}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {n.authorName} · {n.createdAt.toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          <div className="flex items-center gap-1">
            <a
              href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LineChart className="size-3.5" /> Open chart
            </a>
            {dashboardUrl && (
              <a
                href={dashboardUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ExternalLink className="size-3.5" /> Broker order
              </a>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              placeholder="Add note…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitNote();
                }
              }}
              className="h-7 w-48 text-xs"
            />
            <Button variant="outline" size="icon-sm" onClick={submitNote} disabled={pending}>
              {pending ? <StickyNote className="size-3.5 animate-pulse" /> : <Send className="size-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function PositionsTable({
  positions,
  visibleColumns,
  currency,
  grouping = "time",
}: {
  positions: PositionRow[];
  visibleColumns: Record<PositionColumn, boolean>;
  currency: "USD" | "INR";
  grouping?: GroupingMode;
}) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  if (positions.length === 0) {
    return (
      <EmptyState
        title="No Positions Found"
        description="You haven't entered any trades yet. Once a position is placed, it'll appear here with live tracking."
      />
    );
  }

  const groups = new Map<string, PositionRow[]>();
  if (grouping === "baskets") {
    for (const position of positions) {
      const key = position.basketName ?? "No basket";
      const group = groups.get(key) ?? [];
      group.push(position);
      groups.set(key, group);
    }
  } else {
    for (const position of positions) {
      const key = dayKey(position.closedAt ?? position.openedAt);
      const group = groups.get(key) ?? [];
      group.push(position);
      groups.set(key, group);
    }
  }
  const sortedKeys =
    grouping === "baskets"
      ? Array.from(groups.keys()).sort((a, b) => (a === "No basket" ? 1 : b === "No basket" ? -1 : a.localeCompare(b)))
      : Array.from(groups.keys()).sort((a, b) => (a < b ? 1 : -1));

  const columns: PositionColumn[] = POSITION_COLUMNS.filter((key) => visibleColumns[key]);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="w-8 px-3 py-2" />
            {columns.map((c) => (
              <th key={c} className="whitespace-nowrap px-3 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedKeys.map((key) => {
            const group = groups.get(key)!;
            const subtotal = group.reduce((sum, p) => sum + (p.pnl ?? 0), 0);
            return (
              <React.Fragment key={key}>
                <tr className="bg-muted/30">
                  <td colSpan={columns.length + 1} className="px-3 py-1.5 text-xs font-medium">
                    <span className="text-muted-foreground">
                      GROUP: {grouping === "baskets" ? key.toUpperCase() : dayLabel(key)}
                    </span>
                    <span className="ml-3 text-muted-foreground">{group.length} trades</span>
                    <span
                      className={cn(
                        "tabular-figures ml-3 font-semibold",
                        subtotal >= 0 ? "text-positive" : "text-negative",
                      )}
                    >
                      {(() => {
                        // Summing across currencies would be arithmetic on
                        // incomparable numbers — show the split instead.
                        const groupCurrencies = new Set(group.map((p) => p.currency));
                        if (groupCurrencies.size > 1) return "mixed currencies";
                        return formatMoney(subtotal, group[0]?.currency ?? currency);
                      })()}
                    </span>
                  </td>
                </tr>
                {group.map((position) => {
                  const expanded = expandedId === position.id;
                  return (
                    <React.Fragment key={position.id}>
                      <tr
                        className="cursor-pointer border-b last:border-0 hover:bg-muted/20"
                        onClick={() => setExpandedId(expanded ? null : position.id)}
                      >
                        <td className="px-3 py-2">
                          <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", expanded && "rotate-90")} />
                        </td>
                        {visibleColumns["Symbol"] && (
                          <td className="whitespace-nowrap px-3 py-2 font-medium">{position.symbol}</td>
                        )}
                        {visibleColumns["Side"] && (
                          <td className="px-3 py-2">
                            <Badge variant={position.side === "long" ? "default" : "destructive"}>
                              {position.side === "long" ? "LONG" : "SHORT"}
                            </Badge>
                          </td>
                        )}
                        {visibleColumns["Entry → Exit"] && (
                          <td className="tabular-figures whitespace-nowrap px-3 py-2">
                            {position.entryPrice.toFixed(4)} → {position.exitPrice?.toFixed(4) ?? "—"}
                          </td>
                        )}
                        {visibleColumns["Quantity"] && (
                          <td className="tabular-figures px-3 py-2">
                            {position.filledQuantity ?? position.quantity} / {position.quantity}
                          </td>
                        )}
                        {visibleColumns["Status"] && (
                          <td className="px-3 py-2">
                            <Badge variant="secondary">{position.status.toUpperCase()}</Badge>
                          </td>
                        )}
                        {visibleColumns["Close reason"] && (
                          <td className="px-3 py-2 text-muted-foreground">{position.closeReason ?? "—"}</td>
                        )}
                        {visibleColumns["Pnl"] && (
                          <td
                            className={cn(
                              "tabular-figures px-3 py-2 font-medium",
                              (position.pnl ?? 0) >= 0 ? "text-positive" : "text-negative",
                            )}
                          >
                            {formatMoney(position.pnl, position.currency)}
                          </td>
                        )}
                        {visibleColumns["Points"] && (
                          <td
                            className={cn(
                              "tabular-figures px-3 py-2",
                              points(position) === null
                                ? "text-muted-foreground"
                                : points(position)! >= 0
                                  ? "text-positive"
                                  : "text-negative",
                            )}
                          >
                            {formatPoints(points(position))}
                          </td>
                        )}
                        {visibleColumns["Rr"] && (
                          <td className="tabular-figures px-3 py-2">
                            {position.rr !== null ? `${position.rr.toFixed(2)}R` : "—"}
                          </td>
                        )}
                        {visibleColumns["Sl"] && (
                          <td className="tabular-figures px-3 py-2">{position.sl?.toFixed(4) ?? "—"}</td>
                        )}
                        {visibleColumns["Strategy"] && (
                          <td className="px-3 py-2 text-muted-foreground">{position.strategyLabel ?? "—"}</td>
                        )}
                        {visibleColumns["Account"] && (
                          <td className="px-3 py-2 text-muted-foreground">{position.accountLabel}</td>
                        )}
                        {visibleColumns["Since"] && (
                          <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatSince(position.openedAt)}</td>
                        )}
                        {visibleColumns["TiT"] && (
                          <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                            {formatTimeInTrade(position.openedAt, position.closedAt)}
                          </td>
                        )}
                      </tr>
                      <AnimatePresence initial={false}>
                        {expanded && (
                          <tr>
                            <td colSpan={columns.length + 1} className="p-0">
                              <ExecutionsPanel
                                positionId={position.id}
                                provider={position.provider}
                                symbol={position.symbol}
                                currency={currency}
                              />
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
