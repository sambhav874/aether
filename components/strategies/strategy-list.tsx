"use client";

import * as React from "react";
import { AnimatePresence } from "motion/react";
import { ChevronRight, Layers, Activity, Globe, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/trading-module/empty-state";
import { KpiCard } from "@/components/trading-module/kpi-card";
import { StrategySparkline } from "@/components/strategies/strategy-sparkline";
import { StrategyFormDialog } from "@/components/strategies/strategy-form-dialog";
import { LinkedAccountsDialog } from "@/components/strategies/linked-accounts-dialog";
import { WebhookInfoDialog } from "@/components/strategies/webhook-info-dialog";
import { SignalHistoryDialog } from "@/components/strategies/signal-history-dialog";
import { ChartDialog } from "@/components/strategies/chart-dialog";
import { ParametersDialog } from "@/components/strategies/parameters-dialog";
import { RiskExitsDialog } from "@/components/strategies/risk-exits-dialog";
import { ExecutionDialog } from "@/components/strategies/execution-dialog";
import { NotificationsDialog } from "@/components/strategies/notifications-dialog";
import { ShareDialog } from "@/components/strategies/share-dialog";
import { TriggersPerDayPopover } from "@/components/strategies/triggers-per-day-popover";
import { StrategyMenu } from "@/components/strategies/strategy-menu";
import { StrategyRowDetail } from "@/components/strategies/strategy-row-detail";
import { toggleStrategyStatus, deleteStrategy } from "@/lib/strategies/actions";
import { toggleSignalsHidden } from "@/lib/strategies/detail-actions";
import type { StrategyRow, StrategyDetail } from "@/lib/strategies/types";
import type { LinkableAccount } from "@/lib/strategies/accounts";
import type { StrategyPermissionLevel } from "@/lib/strategies/permissions";

type FilterTab = "all" | "active" | "paused" | "global";
type ModalKind =
  | "edit"
  | "linked"
  | "webhook"
  | "history"
  | "chart"
  | "parameters"
  | "risk"
  | "execution"
  | "notifications"
  | "share";

const MARKET_LABEL: Record<StrategyRow["market"], string> = {
  forex: "Forex",
  indian_options: "Indian Options",
  indian_equity: "Indian Equity",
};

function formatRelative(date: Date | null) {
  if (!date) return "Never";
  const ms = Date.now() - date.getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function StrategyList({
  strategies,
  accounts,
  permissions,
}: {
  strategies: StrategyRow[];
  accounts: LinkableAccount[];
  permissions: Record<string, StrategyPermissionLevel>;
}) {
  const [tab, setTab] = React.useState<FilterTab>("all");
  const [search, setSearch] = React.useState("");
  const [, startTransition] = React.useTransition();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [details, setDetails] = React.useState<Record<string, StrategyDetail>>({});
  const [activeModal, setActiveModal] = React.useState<{ kind: ModalKind; strategy: StrategyRow } | null>(null);
  // Bumped whenever a config-editing modal closes, so the already-expanded
  // row's cached detail (webhook/config/positions/signals panel) refetches
  // instead of showing what was true before the save.
  const [refreshTokens, setRefreshTokens] = React.useState<Record<string, number>>({});

  const counts = {
    all: strategies.length,
    active: strategies.filter((s) => s.status === "active").length,
    paused: strategies.filter((s) => s.status === "paused").length,
    global: strategies.filter((s) => s.isGlobal).length,
  };
  const signals24hTotal = strategies.reduce((sum, s) => sum + s.signalsLast24h, 0);

  const filtered = strategies.filter((s) => {
    if (tab === "global") {
      if (!s.isGlobal) return false;
    } else if (tab !== "all" && s.status !== tab) {
      return false;
    }
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function closeModal() {
    if (activeModal) {
      const id = activeModal.strategy.id;
      setRefreshTokens((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
    }
    setActiveModal(null);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard icon={Layers} label="Total Strategies" value={String(counts.all)} caption="All deployed" />
        <KpiCard icon={Activity} label="Active" value={`${counts.active} / ${counts.all}`} caption="Currently running" />
        <KpiCard
          icon={Globe}
          label="Global Strategies"
          value={String(counts.global)}
          caption="System-wide · not yet enforced"
        />
        <KpiCard icon={Radio} label="Signals · 24h" value={String(signals24hTotal)} />
      </div>

      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
          {(["all", "active", "paused", "global"] as FilterTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                tab === t
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
              <span
                className={cn(
                  "tabular-figures rounded-full px-1.5 text-xs",
                  tab === t ? "bg-primary-foreground/20" : "bg-background",
                )}
              >
                {counts[t]}
              </span>
            </button>
          ))}
        </div>
        <StrategyFormDialog accounts={accounts} />
      </div>

      <Input
        placeholder="Search strategies..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="No strategies found"
          description="Configure a strategy to get a webhook URL you can point a TradingView alert (or any webhook source) at."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="w-8 px-3 py-2" />
                <th className="px-3 py-2 font-medium">Strategy</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Handle</th>
                <th className="px-3 py-2 font-medium">Signal history</th>
                <th className="px-3 py-2 font-medium">Last triggered</th>
                <th className="px-3 py-2 text-right font-medium">Triggers / day</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((strategy) => {
                const permission = permissions[strategy.id] ?? "none";
                const expanded = expandedId === strategy.id;
                const detail = details[strategy.id];
                return (
                  <React.Fragment key={strategy.id}>
                    <tr
                      className={cn(
                        "cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30",
                        expanded && "bg-muted/20",
                      )}
                      onClick={() => setExpandedId(expanded ? null : strategy.id)}
                    >
                      <td className="px-3 py-2.5">
                        <ChevronRight
                          className={cn("size-3.5 text-muted-foreground transition-transform", expanded && "rotate-90")}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{strategy.name}</p>
                        <p className="text-xs text-muted-foreground">
                          /{strategy.slug} · {MARKET_LABEL[strategy.market]}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="flex items-center gap-1">
                            <span
                              className={cn(
                                "size-1.5 rounded-full",
                                strategy.status === "active" ? "bg-positive" : "bg-muted-foreground",
                              )}
                            />
                            <Badge variant={strategy.status === "active" ? "default" : "secondary"}>
                              {strategy.status}
                            </Badge>
                          </span>
                          {strategy.isGlobal && <Badge variant="outline">Global</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{strategy.handleType}</td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <StrategySparkline data={strategy.sparkline} />
                          <span className="text-xs text-muted-foreground">{strategy.signalsLast24h} · 24h</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{formatRelative(strategy.lastTriggeredAt)}</td>
                      <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <TriggersPerDayPopover
                            strategyId={strategy.id}
                            maxTriggersPerDay={strategy.maxTriggersPerDay}
                            triggersToday={strategy.triggersToday}
                            canEdit={permission === "edit_execute" || permission === "co_owner"}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <StrategyMenu
                            permission={permission}
                            status={strategy.status}
                            signalsHidden={detail?.signalsHidden ?? false}
                            onWebhookInfo={() => setActiveModal({ kind: "webhook", strategy })}
                            onChart={() => setActiveModal({ kind: "chart", strategy })}
                            onParameters={() => setActiveModal({ kind: "parameters", strategy })}
                            onRiskExits={() => setActiveModal({ kind: "risk", strategy })}
                            onExecution={() => setActiveModal({ kind: "execution", strategy })}
                            onNotifications={() => setActiveModal({ kind: "notifications", strategy })}
                            onToggleSignals={() =>
                              startTransition(async () => {
                                await toggleSignalsHidden(strategy.id);
                              })
                            }
                            onShare={() => setActiveModal({ kind: "share", strategy })}
                            onTogglePause={() => startTransition(() => toggleStrategyStatus(strategy.id))}
                            onEdit={() => setActiveModal({ kind: "edit", strategy })}
                            onLinkedAccounts={() => setActiveModal({ kind: "linked", strategy })}
                            onSignalHistory={() => setActiveModal({ kind: "history", strategy })}
                            onDelete={() => startTransition(() => deleteStrategy(strategy.id))}
                          />
                        </div>
                      </td>
                    </tr>
                    <AnimatePresence initial={false}>
                      {expanded && (
                        <tr>
                          <td colSpan={8} className="p-0">
                            <StrategyRowDetail
                              strategy={strategy}
                              refreshToken={refreshTokens[strategy.id] ?? 0}
                              onDetailLoaded={(d) => setDetails((prev) => ({ ...prev, [strategy.id]: d }))}
                            />
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <StrategyFormDialog
        strategy={activeModal?.kind === "edit" ? activeModal.strategy : undefined}
        accounts={accounts}
        linkedAccountIds={
          activeModal?.kind === "edit" ? activeModal.strategy.linkedAccountIds : []
        }
        open={activeModal?.kind === "edit"}
        onOpenChange={(open) => !open && closeModal()}
      />

      {activeModal?.kind === "linked" && (
        <LinkedAccountsDialog
          strategyId={activeModal.strategy.id}
          strategyMarket={MARKET_LABEL[activeModal.strategy.market]}
          accounts={accounts}
          linkedAccountIds={activeModal.strategy.linkedAccountIds}
          open
          onOpenChange={(open) => !open && closeModal()}
        />
      )}

      {activeModal?.kind === "webhook" && (
        <WebhookInfoDialog
          strategyId={activeModal.strategy.id}
          slug={activeModal.strategy.slug}
          hasSecret={activeModal.strategy.hasWebhookSecret}
          open
          onOpenChange={(open) => !open && closeModal()}
        />
      )}

      {activeModal?.kind === "history" && (
        <SignalHistoryDialog
          strategyId={activeModal.strategy.id}
          strategyName={activeModal.strategy.name}
          open
          onOpenChange={(open) => !open && closeModal()}
        />
      )}

      {activeModal?.kind === "chart" && (
        <ChartDialog
          strategyId={activeModal.strategy.id}
          strategyName={activeModal.strategy.name}
          defaultSymbol={activeModal.strategy.defaultSymbol}
          initialSymbol={details[activeModal.strategy.id]?.chartSymbol ?? null}
          initialInterval={details[activeModal.strategy.id]?.chartInterval ?? null}
          open
          onOpenChange={(open) => !open && closeModal()}
        />
      )}

      {activeModal?.kind === "parameters" && (
        <ParametersDialog
          strategyId={activeModal.strategy.id}
          strategyName={activeModal.strategy.name}
          initialCoolDown={details[activeModal.strategy.id]?.coolDownPeriod ?? activeModal.strategy.coolDownPeriod}
          initialConfig={details[activeModal.strategy.id]?.config ?? {}}
          open
          onOpenChange={(open) => !open && closeModal()}
        />
      )}

      {activeModal?.kind === "risk" && (
        <RiskExitsDialog
          strategyId={activeModal.strategy.id}
          strategyName={activeModal.strategy.name}
          initial={details[activeModal.strategy.id]?.riskSettings ?? null}
          workspaceDefaults={details[activeModal.strategy.id]?.workspaceDefaults ?? null}
          trailingRules={details[activeModal.strategy.id]?.trailingRules ?? []}
          partialRules={details[activeModal.strategy.id]?.partialRules ?? []}
          open
          onOpenChange={(open) => !open && closeModal()}
        />
      )}

      {activeModal?.kind === "execution" && (
        <ExecutionDialog
          strategyId={activeModal.strategy.id}
          strategyName={activeModal.strategy.name}
          initialMaxTriggersPerDay={activeModal.strategy.maxTriggersPerDay}
          initialPaperTrading={details[activeModal.strategy.id]?.paperTrading ?? false}
          copiers={details[activeModal.strategy.id]?.copiers ?? []}
          open
          onOpenChange={(open) => !open && closeModal()}
        />
      )}

      {activeModal?.kind === "notifications" && (
        <NotificationsDialog
          strategyId={activeModal.strategy.id}
          strategyName={activeModal.strategy.name}
          initial={
            details[activeModal.strategy.id]?.notifications ?? [
              { event: "entry", email: false, telegram: false, push: false, telegramConnectionIds: [] },
              { event: "partial", email: false, telegram: false, push: false, telegramConnectionIds: [] },
              { event: "exit", email: false, telegram: false, push: false, telegramConnectionIds: [] },
            ]
          }
          open
          onOpenChange={(open) => !open && closeModal()}
        />
      )}

      {activeModal?.kind === "share" && (
        <ShareDialog
          strategyId={activeModal.strategy.id}
          strategyName={activeModal.strategy.name}
          open
          onOpenChange={(open) => !open && closeModal()}
        />
      )}
    </div>
  );
}
