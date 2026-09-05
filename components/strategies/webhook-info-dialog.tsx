"use client";

import * as React from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchWebhookSecret, rotateWebhookSecret } from "@/lib/strategies/detail-actions";

function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className ?? "size-6 shrink-0"}
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-3.5 text-positive" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

function CopyField({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2.5 py-1.5">
      <code className="flex-1 overflow-x-auto text-xs whitespace-nowrap">{value}</code>
      <CopyButton value={value} />
    </div>
  );
}

function CopyBlock({ value }: { value: string }) {
  return (
    <div className="relative">
      <pre className="max-h-56 overflow-auto rounded-md border bg-muted/30 p-2.5 pr-9 text-xs">{value}</pre>
      <CopyButton value={value} className="absolute top-1 right-1 size-6" />
    </div>
  );
}

const ACTIONS: [string, string][] = [
  ["BUY", "Opens a LONG position"],
  ["SELL", "Opens a SHORT position"],
  ["CLOSELONG", "Closes existing LONG position(s)"],
  ["CLOSESHORT", "Closes existing SHORT position(s)"],
  ["CLOSELONGPARTIAL", "Partially closes LONG position(s) — needs percent= or quantity="],
  ["CLOSESHORTPARTIAL", "Partially closes SHORT position(s) — needs percent= or quantity="],
  ["MODIFY", "Updates stop-loss/target on existing positions"],
  ["CLOSESHORTBUY", "Closes SHORT(s), then opens a new LONG"],
  ["CLOSELONGSELL", "Closes LONG(s), then opens a new SHORT"],
  ["CLOSESHORTSELL", "Closes SHORT(s), then opens a new SHORT"],
  ["CLOSELONGBUY", "Closes LONG(s), then opens a new LONG"],
];

const PARAMS: [string, string][] = [
  ["tag=X", "Scopes close/modify/partial signals to positions opened with the same tag"],
  ["quantity=Y", "Explicit position size for an entry"],
  ["risk=X", "Risk % of entry price used for the auto stop-loss (AUTO handle, default 1%)"],
  ["price=X", "Entry limit price — indian_options BUY/SELL (and compound open legs) only"],
  ["stopLoss=X / target=X", "MODIFY only — combine with type="],
  ["type=PRICE|POINTS|PERCENTAGE", "Unit for stopLoss=/target= on MODIFY"],
  ["side=LONG|SHORT", "MODIFY only — which side to target, default LONG"],
  ["percent=N", "CLOSE*PARTIAL — % of open quantity, (0,100]"],
  ["comment=X", "Free-text metadata stored on the resulting position"],
  ["basketId= / basketName=", "Groups the resulting position into a basket"],
  ["paper=true|false", "Per-signal override of this strategy's paper-trading flag"],
  ["secret=X", "Required only when this strategy has a webhook secret set"],
];

/** The Pine input a user edits is the slug — everything else in the template
 * builds the message around it, which is the whole point of the slug-in-body
 * design (one webhook URL, no per-strategy URL to paste). */
function pineTemplate(slug: string, hasSecret: boolean) {
  const secretInput = hasSecret
    ? '\nsecret   = input.string("PASTE_SECRET_HERE", "Webhook Secret")'
    : "";
  const secretAppend = hasSecret ? '\n    m := m + ",secret=" + secret' : "";
  return `//@version=6
indicator("Webhook Signals", overlay = true)

slug     = input.string("${slug}", "Strategy_Slug")
sym      = input.string("", "Symbol (blank = strategy default)")
tag      = input.string("S1", "Tag")
qty      = input.float(0.01, "Quantity")
sendSlTp = input.bool(true, "Send stopLoss / target to broker")
paper    = input.bool(false, "Paper Mode (paper=true)")${secretInput}

msg(action, sl, tp) =>
    m = slug + "," + action
    m := sym == "" ? m : m + "," + sym
    m := m + ",tag=" + tag + ",quantity=" + str.tostring(qty)
    m := sendSlTp ? m + ",stopLoss=" + str.tostring(sl) + ",target=" + str.tostring(tp) + ",type=PRICE" : m
    m := paper ? m + ",paper=true" : m${secretAppend}
    '{"message":"' + m + '"}'

longSignal  = ta.crossover(ta.ema(close, 9), ta.ema(close, 21))
shortSignal = ta.crossunder(ta.ema(close, 9), ta.ema(close, 21))

if longSignal
    alert(msg("BUY", close * 0.99, close * 1.02), alert.freq_once_per_bar_close)
if shortSignal
    alert(msg("SELL", close * 1.01, close * 0.98), alert.freq_once_per_bar_close)`;
}

export function WebhookInfoDialog({
  strategyId,
  slug,
  hasSecret: initialHasSecret,
  open,
  onOpenChange,
}: {
  strategyId: string;
  slug: string;
  hasSecret: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Only ever mounted client-side (parent renders it conditionally after a
  // click), so reading window directly here is safe — no SSR pass sees it.
  const origin = window.location.origin;
  const url = `${origin}/api/webhook/strategy/signal`;
  const tradingViewUrl = `${origin}/api/webhook/tradingview`;

  const [secret, setSecret] = React.useState<string | null>(null);
  const [hasSecret, setHasSecret] = React.useState(initialHasSecret);
  const [canManage, setCanManage] = React.useState(false);
  const [revealed, setRevealed] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    let cancelled = false;
    fetchWebhookSecret(strategyId).then((result) => {
      if (cancelled) return;
      setSecret(result.secret);
      setHasSecret(result.secret !== null);
      setCanManage(result.canManage);
    });
    return () => {
      cancelled = true;
    };
  }, [strategyId]);

  const secretToken = secret ?? (hasSecret ? "<your secret>" : null);
  const message = `${slug},BUY,EURUSD,quantity=0.1${secretToken ? `,secret=${secretToken}` : ""}`;
  const curl = `curl -X POST ${url} \\\n  -H "Content-Type: application/json" \\\n  -d '{"message": "${message}"}'`;
  const tvBody = `{"message":"${slug},{{strategy.order.action}},{{ticker}},quantity=1${
    secretToken ? `,secret=${secretToken}` : ""
  }"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Webhook info</DialogTitle>
          <DialogDescription>Send trading signals to this strategy.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Webhook URL</p>
            <CopyField value={url} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Strategy slug</p>
            <CopyField value={slug} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Webhook secret</p>
            {hasSecret ? (
              <div className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2.5 py-1.5">
                <code className="flex-1 overflow-x-auto text-xs whitespace-nowrap">
                  {secret === null ? "•••• (no permission to view)" : revealed ? secret : "•".repeat(24)}
                </code>
                {secret !== null && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0"
                      onClick={() => setRevealed((v) => !v)}
                    >
                      {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </Button>
                    <CopyButton value={secret} />
                  </>
                )}
              </div>
            ) : (
              <p className="rounded-md border border-dashed px-2.5 py-1.5 text-xs text-muted-foreground">
                None — anyone who knows the slug can fire signals at this strategy.
              </p>
            )}
            {canManage && (
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await rotateWebhookSecret(strategyId);
                      if (result.secret) {
                        setSecret(result.secret);
                        setHasSecret(true);
                        setRevealed(true);
                      }
                    })
                  }
                >
                  {hasSecret ? <RefreshCw className="size-3" /> : <KeyRound className="size-3" />}
                  {hasSecret ? "Rotate" : "Generate"}
                </Button>
              </div>
            )}
            {hasSecret && (
              <p className="text-[11px] text-muted-foreground">
                Rotating breaks every alert still sending the old secret — update TradingView right after.
              </p>
            )}
          </div>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="w-full">
            <TabsTrigger value="overview" className="flex-1">
              Overview
            </TabsTrigger>
            <TabsTrigger value="tradingview" className="flex-1">
              TradingView
            </TabsTrigger>
            <TabsTrigger value="actions" className="flex-1">
              Actions
            </TabsTrigger>
            <TabsTrigger value="params" className="flex-1">
              Params
            </TabsTrigger>
            <TabsTrigger value="curl" className="flex-1">
              cURL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-2 pt-3 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Method:</span> POST ·{" "}
              <span className="font-medium text-foreground">Content-Type:</span> application/json
              (form-urlencoded and plain text also accepted)
            </p>
            <p className="font-mono text-foreground">SLUG,ACTION,SYMBOL[,key=value,...]</p>
            <p>
              SYMBOL is optional if the strategy has a default symbol configured. Key/value pairs
              are comma-separated and case-insensitive on the key.
            </p>
          </TabsContent>

          <TabsContent value="tradingview" className="space-y-2 pt-3 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">1.</span> In the alert dialog, open{" "}
              <span className="font-medium text-foreground">Notifications → Webhook URL</span> and paste:
            </p>
            <CopyField value={tradingViewUrl} />
            <p className="text-[11px]">
              This endpoint acks instantly and never replies with an error — check the Signals tab for what
              happened to each alert.
            </p>
            <p>
              <span className="font-medium text-foreground">2.</span> Put this in the alert{" "}
              <span className="font-medium text-foreground">Message</span> box:
            </p>
            <CopyBlock value={tvBody} />
            <p className="text-[11px]">
              <span className="font-mono">{"{{strategy.order.action}}"}</span> resolves to buy/sell on a Pine
              strategy; on an indicator alert, write the action literally (BUY, SELL, CLOSELONG, …). An
              exchange prefix on <span className="font-mono">{"{{ticker}}"}</span> (OANDA:XAUUSD) is stripped
              automatically.
            </p>
            <p>
              <span className="font-medium text-foreground">3.</span> Or drop this indicator on the chart and
              only edit the <span className="font-medium text-foreground">Strategy_Slug</span> input:
            </p>
            <CopyBlock value={pineTemplate(slug, hasSecret)} />
          </TabsContent>

          <TabsContent value="actions" className="pt-3">
            <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1 text-xs">
              {ACTIONS.map(([action, desc]) => (
                <div key={action} className="flex items-start gap-2">
                  <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                    {action}
                  </code>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              The Entry / Exit / SL-Target switches on the expanded row cancel whole categories of these —
              a cancelled signal still shows up in the log with the reason.
            </p>
          </TabsContent>

          <TabsContent value="params" className="pt-3">
            <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1 text-xs">
              {PARAMS.map(([param, desc]) => (
                <div key={param} className="flex items-start gap-2">
                  <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                    {param}
                  </code>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="curl" className="pt-3">
            <CopyBlock value={curl} />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
