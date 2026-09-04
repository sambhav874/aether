"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppearance } from "@/components/providers/appearance-provider";
import { fetchSignalHistory } from "@/lib/strategies/actions";
import { fetchStrategyPositions, getStrategyDetailAction, updateStrategyActions } from "@/lib/strategies/detail-actions";
import { meetsLevel } from "@/lib/strategies/permission-levels";
import { formatMoney } from "@/lib/format";
import type { StrategyRow, SignalRow } from "@/lib/strategies/types";
import type { PositionRow } from "@/lib/positions/types";
import type { StrategyDetail } from "@/lib/strategies/types";

const MARKET_LABEL: Record<StrategyRow["market"], string> = {
  forex: "Forex",
  indian_options: "Indian Options",
  indian_equity: "Indian Equity",
};

const MARKET_CURRENCY: Record<StrategyRow["market"], "USD" | "INR"> = {
  forex: "USD",
  indian_options: "INR",
  indian_equity: "INR",
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

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2.5 py-1.5">
      <code className="flex-1 overflow-x-auto text-xs whitespace-nowrap">{value}</code>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-3.5 text-positive" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function SignalCard({ signal }: { signal: SignalRow }) {
  const sideTone = signal.side === "long" ? "positive" : signal.side === "short" ? "negative" : "neutral";
  return (
    <div className="rounded-lg border p-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono font-medium">{signal.symbol}</span>
        <Badge variant={signal.status === "received" ? "default" : signal.status === "rejected" ? "destructive" : "outline"} className="text-[10px]">
          {signal.status === "received" ? "EXECUTED" : signal.status.toUpperCase()}
        </Badge>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-muted-foreground">
        {signal.side && (
          <span className={sideTone === "positive" ? "text-positive" : sideTone === "negative" ? "text-negative" : ""}>
            {signal.side.toUpperCase()}
          </span>
        )}
        <span>Px {signal.sl ?? "0"}</span>
        {signal.sl && <span>SL {signal.sl}</span>}
        <span>Action {signal.action}</span>
      </div>
      {signal.resultMessage && <p className="mt-1 text-muted-foreground">{signal.resultMessage}</p>}
      <p className="mt-1 text-[10px] text-muted-foreground">{formatRelative(signal.receivedAt)}</p>
    </div>
  );
}

function PositionCard({ position }: { position: PositionRow }) {
  const currency = MARKET_CURRENCY[position.market];
  return (
    <div className="rounded-lg border p-2.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-mono font-medium">{position.symbol}</span>
        <span className={position.side === "long" ? "text-positive" : "text-negative"}>
          {position.side.toUpperCase()}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-muted-foreground">
        <span>
          {position.entryPrice} → {position.exitPrice ?? "—"}
        </span>
        <span className={position.status === "open" ? "" : (position.pnl ?? 0) >= 0 ? "text-positive" : "text-negative"}>
          {position.status === "open" ? "OPEN" : formatMoney(position.pnl ?? 0, currency)}
        </span>
      </div>
    </div>
  );
}

function ActionToggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
    </div>
  );
}

export function StrategyRowDetail({
  strategy,
  refreshToken,
  onDetailLoaded,
}: {
  strategy: StrategyRow;
  refreshToken: number;
  onDetailLoaded: (detail: StrategyDetail) => void;
}) {
  const { motion: appearanceMotion } = useAppearance();
  const reduced = appearanceMotion === "reduced";
  const [signals, setSignals] = React.useState<SignalRow[] | null>(null);
  const [positions, setPositions] = React.useState<PositionRow[] | null>(null);
  const [canEdit, setCanEdit] = React.useState(false);
  const [, startTransition] = React.useTransition();
  // The switches flip immediately and fall back to the server's value when
  // the transition ends — so a rejected save (permission lost, row gone)
  // visibly snaps back instead of lying about the strategy's state.
  const [actions, setOptimisticActions] = React.useOptimistic({
    allowEntry: strategy.allowEntry,
    allowExit: strategy.allowExit,
    allowModify: strategy.allowModify,
  });

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([fetchSignalHistory(strategy.id), fetchStrategyPositions(strategy.id), getStrategyDetailAction(strategy.id)]).then(
      ([signalRows, positionRows, detail]) => {
        if (cancelled) return;
        setSignals(signalRows);
        setPositions(positionRows);
        if (detail) {
          onDetailLoaded(detail);
          setCanEdit(meetsLevel(detail.permission, "edit_execute"));
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy.id, refreshToken]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = origin ? `${origin}/api/webhook/strategy/signal` : "";
  const tradingViewUrl = origin ? `${origin}/api/webhook/tradingview` : "";

  function setAction(key: "allowEntry" | "allowExit" | "allowModify", value: boolean) {
    const next = { ...actions, [key]: value };
    startTransition(async () => {
      setOptimisticActions(next);
      await updateStrategyActions(strategy.id, next);
    });
  }

  return (
    <motion.div
      initial={reduced ? undefined : { height: 0, opacity: 0 }}
      animate={reduced ? undefined : { height: "auto", opacity: 1 }}
      exit={reduced ? undefined : { height: 0, opacity: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden border-t bg-muted/20"
    >
      <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground uppercase">Webhook</p>
            <CopyField value={url} />
            <p className="mt-1.5 mb-1 text-[11px] text-muted-foreground">
              TradingView alerts (acks instantly, never replies with errors):
            </p>
            <CopyField value={tradingViewUrl} />
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Slug:</span>
              <code className="text-xs">{strategy.slug}</code>
              <a
                href={`/api/webhook/strategy/signal`}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3" />
              </a>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground uppercase">Configuration</p>
            <div className="rounded-lg border px-2.5 divide-y">
              <ConfigRow label="Market" value={MARKET_LABEL[strategy.market]} />
              <ConfigRow label="Signal type" value="Webhook" />
              <ConfigRow label="Handle by" value={strategy.handleType} />
              <ConfigRow
                label="Max / day"
                value={strategy.maxTriggersPerDay ? `${strategy.triggersToday}/${strategy.maxTriggersPerDay}` : "Unlimited"}
              />
              <ConfigRow label="Cooldown" value={strategy.coolDownPeriod ? `${strategy.coolDownPeriod}s` : "None"} />
              <ConfigRow label="Accounts" value={strategy.linkedAccountIds.length} />
              <ConfigRow label="Created" value={strategy.createdAt.toLocaleDateString()} />
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground uppercase">Actions</p>
            <div className="divide-y rounded-lg border px-2.5">
              <ActionToggle
                label="Entry"
                hint="Open positions from BUY / SELL signals"
                checked={actions.allowEntry}
                disabled={!canEdit}
                onChange={(next) => setAction("allowEntry", next)}
              />
              <ActionToggle
                label="Exit"
                hint="Close positions from CLOSE signals"
                checked={actions.allowExit}
                disabled={!canEdit}
                onChange={(next) => setAction("allowExit", next)}
              />
              <ActionToggle
                label="SL / Target"
                hint="Apply MODIFY signals to open positions"
                checked={actions.allowModify}
                disabled={!canEdit}
                onChange={(next) => setAction("allowModify", next)}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Disabled actions are cancelled with a reason on the signal — stop-loss, target and manual exits
              still run.
            </p>
          </div>
        </div>

        <div>
          <Tabs defaultValue="signals">
            <TabsList>
              <TabsTrigger value="signals">Signals</TabsTrigger>
              <TabsTrigger value="positions">Positions</TabsTrigger>
            </TabsList>
            <TabsContent value="signals" className="pt-3">
              {signals === null ? (
                <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
              ) : signals.length === 0 ? (
                <p className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">
                  No signals yet.
                </p>
              ) : (
                <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                  {signals.map((s) => (
                    <SignalCard key={s.id} signal={s} />
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="positions" className="pt-3">
              {positions === null ? (
                <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
              ) : positions.length === 0 ? (
                <p className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">
                  No positions yet.
                </p>
              ) : (
                <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                  {positions.map((p) => (
                    <PositionCard key={p.id} position={p} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </motion.div>
  );
}
