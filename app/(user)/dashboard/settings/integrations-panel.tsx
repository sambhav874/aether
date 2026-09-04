"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Copy, HelpCircle, KeyRound, Plus, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AccountDetails } from "@/lib/runners/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { TelegramPanel, type TelegramConnection } from "./telegram-panel";
import { MtServerCombobox } from "./mt-server-combobox";
import {
  connectDhanAccount,
  connectMetaApiAccount,
  connectMotilalAccount,
  disconnectAccount,
  getAccountOtp,
  markAccountWhitelisted,
  startMotilalPortalLogin,
  syncAccount,
  toggleAccountEnabled,
  togglePositionSync,
  type ConnectActionState,
} from "./integrations-actions";

export type IntegrationAccount = {
  id: string;
  label: string;
  provider: "metaapi" | "zerodha" | "dhan" | "motilal";
  status: "connected" | "disconnected" | "needs_reauth" | "syncing" | "whitelist_pending";
  staticIp: string | null;
  balance: string | null;
  equity: string | null;
  currency: string | null;
  /** Broker-reported extras, refreshed on each balance sync. */
  metadata: AccountDetails | null;
  lastSyncAt: Date | null;
  enabled: boolean;
  positionSyncEnabled: boolean;
};

/**
 * Balances are stored per account in that account's own currency, so they can
 * only be rendered — never summed — across accounts. INR and USD accounts sit
 * in the same table.
 */
function money(amount: string | number | null | undefined, currency: string | null, digits = 2) {
  if (amount === null || amount === undefined || amount === "") return "—";
  const value = Number(amount);
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * Equity totalled per currency and rendered as "₹-741.12 + $10,059.58".
 * Never collapse these into one number: the accounts below span INR and USD,
 * and summing them produced a figure that was wrong in both.
 */
function equityTotal(accounts: IntegrationAccount[]) {
  const byCurrency = accounts.reduce<Record<string, number>>((totals, a) => {
    if (!a.equity) return totals;
    const key = a.currency || "USD";
    totals[key] = (totals[key] ?? 0) + Number(a.equity);
    return totals;
  }, {});
  const entries = Object.entries(byCurrency);
  if (entries.length === 0) return "—";
  return entries.map(([cur, total]) => money(total, cur)).join(" + ");
}

const MARGIN_MODE_LABELS: Record<string, string> = {
  ACCOUNT_MARGIN_MODE_RETAIL_HEDGING: "Hedging",
  ACCOUNT_MARGIN_MODE_RETAIL_NETTING: "Netting",
  ACCOUNT_MARGIN_MODE_EXCHANGE: "Exchange",
};

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  ACCOUNT_TRADE_MODE_REAL: "Live",
  ACCOUNT_TRADE_MODE_DEMO: "Demo",
  ACCOUNT_TRADE_MODE_CONTEST: "Contest",
};

type ProviderMeta = {
  id: IntegrationAccount["provider"];
  name: string;
  description: string;
  available: boolean;
};

const PROVIDERS: ProviderMeta[] = [
  {
    id: "metaapi",
    name: "Bridge",
    description: "MT5 bridge — tick feed and order execution for connected forex accounts.",
    available: true,
  },
  {
    id: "zerodha",
    name: "Zerodha",
    description: "Kite Connect — Indian F&O and equity, order routing + optional tick feed.",
    available: true,
  },
  {
    id: "dhan",
    name: "Dhan",
    description: "Order routing + shared market-data tick feed for Indian instruments.",
    available: true,
  },
  {
    id: "motilal",
    name: "Motilal Oswal",
    description: "Order routing + pull-based LTP quotes — no streaming tick feed.",
    available: true,
  },
];

const initialState: ConnectActionState = {};

function FieldLabel({
  htmlFor,
  children,
  help,
}: {
  htmlFor: string;
  children: React.ReactNode;
  help: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Label htmlFor={htmlFor} className="text-xs">
        {children}
      </Label>
      <Tooltip>
        <TooltipTrigger
          render={
            <button type="button" tabIndex={-1} className="text-muted-foreground hover:text-foreground">
              <HelpCircle className="size-3" />
            </button>
          }
        />
        <TooltipContent side="right">{help}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function statusVariant(status: IntegrationAccount["status"]) {
  if (status === "connected") return "default" as const;
  if (status === "needs_reauth") return "destructive" as const;
  return "secondary" as const;
}

function formatSync(date: Date | null) {
  if (!date) return "—";
  const mins = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return `${hours}h ago`;
}

function OtpButton({ accountId }: { accountId: string }) {
  const [pending, startTransition] = React.useTransition();
  const [result, setResult] = React.useState<{ code: string; secondsRemaining: number } | "none" | null>(
    null,
  );

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="ghost"
        size="icon-sm"
        title="Show live TOTP code"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const otp = await getAccountOtp(accountId);
            setResult(otp ?? "none");
          })
        }
      >
        <KeyRound className="size-3.5" />
      </Button>
      {result === "none" && <span className="text-xs text-muted-foreground">no TOTP secret stored</span>}
      {result && result !== "none" && (
        <button
          type="button"
          className="flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-xs hover:bg-muted"
          title="Copy code"
          onClick={() => navigator.clipboard.writeText(result.code)}
        >
          {result.code}
          <Copy className="size-3" />
          <span className="text-muted-foreground">({result.secondsRemaining}s)</span>
        </button>
      )}
    </div>
  );
}

/** One label/value pair in the expanded account detail grid. */
function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * The full broker-reported picture for one account, from broker_accounts.metadata.
 * Only fields the broker actually returned are rendered — an adapter that reports
 * nothing shows the empty-state line instead of a grid of dashes.
 */
function AccountDetailPanel({ account }: { account: IntegrationAccount }) {
  const d = account.metadata;
  const digits = d?.currencyDigits ?? 2;
  const cur = account.currency;

  if (!d || Object.keys(d).length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No broker details stored yet — hit sync to pull them.
      </p>
    );
  }

  const items: { label: string; value: React.ReactNode }[] = [];
  const push = (label: string, value: React.ReactNode, present: boolean) => {
    if (present) items.push({ label, value });
  };

  push("Broker", d.broker, !!d.broker);
  push("Server", <span className="font-mono text-xs">{d.server}</span>, !!d.server);
  push("Login", <span className="font-mono text-xs">{d.login}</span>, !!d.login);
  push("Account holder", d.holder, !!d.holder);
  push("Currency", cur, !!cur);
  push("Balance", money(account.balance, cur, digits), account.balance !== null);
  push("Equity", money(account.equity, cur, digits), account.equity !== null);
  push("Credit", money(d.credit, cur, digits), d.credit !== undefined);
  push("Margin", money(d.margin, cur, digits), d.margin !== undefined);
  push("Free margin", money(d.freeMargin, cur, digits), d.freeMargin !== undefined);
  push("Leverage", `1:${d.leverage}`, d.leverage !== undefined);
  push("Margin mode", MARGIN_MODE_LABELS[d.marginMode ?? ""] ?? d.marginMode, !!d.marginMode);
  push(
    "Account type",
    ACCOUNT_TYPE_LABELS[d.accountType ?? ""] ?? d.accountType,
    !!d.accountType,
  );
  push("Platform", d.platform?.toUpperCase(), !!d.platform);
  push(
    "Trading",
    <span className={d.tradeAllowed ? undefined : "text-negative"}>
      {d.tradeAllowed ? "Allowed" : "Blocked by broker"}
    </span>,
    d.tradeAllowed !== undefined,
  );
  push(
    "Access",
    <span className={d.investorMode ? "text-negative" : undefined}>
      {d.investorMode ? "Read-only (investor)" : "Full"}
    </span>,
    d.investorMode !== undefined,
  );

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <DetailItem key={item.label} label={item.label} value={item.value} />
      ))}
    </dl>
  );
}

function AccountRow({
  account,
  canManage,
  columnCount,
}: {
  account: IntegrationAccount;
  canManage: boolean;
  columnCount: number;
}) {
  const [pending, startTransition] = React.useTransition();
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const showOtp = account.provider === "dhan" || account.provider === "motilal";

  return (
    <>
    <tr className={expanded ? "border-b-0" : "border-b last:border-0"}>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex items-start gap-1.5 text-left hover:opacity-80"
        >
          <ChevronRight
            className={cn(
              "mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-90",
            )}
          />
          <span>
            <span className="block font-medium">{account.label}</span>
            <span className="block font-mono text-xs text-muted-foreground">
              {account.metadata?.server
                ? `${account.metadata.server} · ${account.metadata.login ?? ""}`.trim()
                : `#${account.id.slice(0, 6)}`}
            </span>
          </span>
        </button>
        {canManage && account.status === "whitelist_pending" && (
          <div className="mt-1.5 max-w-md rounded-md bg-muted/30 px-2 py-1.5">
            <p className="text-xs text-muted-foreground">
              SEBI requires order placement from a whitelisted static IP. Add{" "}
              <code className="font-medium text-foreground">{account.staticIp ?? "— not configured —"}</code>{" "}
              to this account&rsquo;s IP whitelist, then confirm.
            </p>
            <Button
              size="xs"
              variant="outline"
              className="mt-1"
              disabled={pending}
              onClick={() => startTransition(() => markAccountWhitelisted(account.id))}
            >
              Mark as whitelisted
            </Button>
          </div>
        )}
        {syncError && <p className="mt-1 text-xs text-negative">{syncError}</p>}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {money(account.balance, account.currency, account.metadata?.currencyDigits)}
      </td>
      <td className="px-3 py-2 text-right font-medium tabular-nums">
        {money(account.equity, account.currency, account.metadata?.currencyDigits)}
      </td>
      <td className="px-3 py-2">
        <Badge variant={statusVariant(account.status)}>{account.status.replace("_", " ")}</Badge>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatSync(account.lastSyncAt)}</td>
      {canManage && (
        <td className="px-3 py-2">
          <div className="flex items-center justify-end gap-2">
            {showOtp && <OtpButton accountId={account.id} />}
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={pending}
              title={syncError ?? "Sync balance now"}
              onClick={() =>
                startTransition(async () => {
                  const result = await syncAccount(account.id);
                  setSyncError(result.error ?? null);
                })
              }
            >
              <RefreshCw className={pending ? "size-3.5 animate-spin" : "size-3.5"} />
            </Button>
            <Switch
              checked={account.enabled}
              disabled={pending}
              title={account.enabled ? "Disable trading on this account" : "Enable trading on this account"}
              onCheckedChange={() => startTransition(() => toggleAccountEnabled(account.id))}
            />
            <Switch
              size="sm"
              checked={account.positionSyncEnabled}
              disabled={pending}
              title={account.positionSyncEnabled ? "Disable position sync" : "Enable position sync"}
              onCheckedChange={() => startTransition(() => togglePositionSync(account.id))}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={pending}
              title="Remove account"
              onClick={() => startTransition(() => disconnectAccount(account.id))}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </td>
      )}
    </tr>
    {expanded && (
      <tr className="border-b last:border-0">
        <td colSpan={columnCount} className="bg-muted/20 px-3 pb-4 pt-1">
          <div className="pl-5">
            <AccountDetailPanel account={account} />
          </div>
        </td>
      </tr>
    )}
    </>
  );
}

function MetaApiConnectForm({ onSuccess }: { onSuccess: () => void }) {
  const [state, formAction, pending] = useActionState(connectMetaApiAccount, initialState);
  React.useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);
  return (
    <form action={formAction} className="grid gap-3">
      <div className="space-y-1">
        <Label htmlFor="mt5-name" className="text-xs">Label (optional)</Label>
        <Input id="mt5-name" name="name" placeholder="e.g. Main, Algo, Paper" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="mt5-login" className="text-xs">Account ID</Label>
        <Input id="mt5-login" name="login" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="mt5-password" className="text-xs">Password</Label>
        <Input id="mt5-password" name="password" type="password" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="mt5-server" className="text-xs">MT5 Server</Label>
        <MtServerCombobox id="mt5-server" name="server" />
      </div>
      {state.error && <p className="text-sm text-negative">{state.error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Connecting…" : "Save connection"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DhanConnectForm({ onSuccess }: { onSuccess: () => void }) {
  const [state, formAction, pending] = useActionState(connectDhanAccount, initialState);
  React.useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);
  return (
    <form action={formAction} className="grid gap-3">
      <div className="space-y-1">
        <Label htmlFor="dhan-label" className="text-xs">Label (optional)</Label>
        <Input id="dhan-label" name="label" placeholder="e.g. Main, Algo, Paper" />
        <p className="text-xs text-muted-foreground">A friendly name for this account.</p>
      </div>
      <div className="space-y-1">
        <FieldLabel
          htmlFor="dhan-client"
          help="web.dhan.co → profile icon (top-right) → Access DhanHQ APIs → Profile & Account Details. Your Client ID is shown there."
        >
          Dhan Client ID
        </FieldLabel>
        <Input id="dhan-client" name="dhanClientId" required />
      </div>
      <div className="space-y-1">
        <FieldLabel
          htmlFor="dhan-token"
          help="Same Access DhanHQ APIs page → Trading APIs tab → Generate access token. First time, click 'Request Access' and refresh. Valid ~24h — copy it immediately, it's shown once."
        >
          Access token
        </FieldLabel>
        <Input id="dhan-token" name="accessToken" type="password" required />
        <p className="text-xs text-muted-foreground">
          Generate a 24h access token from web.dhan.co &gt; Access DhanHQ APIs.
        </p>
      </div>
      <div className="space-y-1">
        <FieldLabel htmlFor="dhan-pin" help="Your Dhan trading PIN — only needed if you enable TOTP-based auto token generation.">
          PIN (optional)
        </FieldLabel>
        <Input id="dhan-pin" name="pin" type="password" />
      </div>
      <div className="space-y-1">
        <FieldLabel
          htmlFor="dhan-totp"
          help="Same Access DhanHQ APIs page → Setup TOTP. Copy the 32-character base32 setup key (not the 6-digit code)."
        >
          TOTP Secret (base32, optional)
        </FieldLabel>
        <Input id="dhan-totp" name="totpSecret" placeholder="ABCDEFGHIJKLMNOP..." />
        <p className="text-xs text-muted-foreground">
          From Dhan&rsquo;s &ldquo;Setup TOTP&rdquo; screen — the base32 setup code, not the 6-digit OTP.
          Stored encrypted; lets Aether show you a live code when your access token needs renewing.
        </p>
      </div>
      {state.error && <p className="text-sm text-negative">{state.error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Connecting…" : "Save connection"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function MotilalConnectForm({
  onSuccess,
  vendorKey,
}: {
  onSuccess: () => void;
  vendorKey: boolean;
}) {
  const [state, formAction, pending] = useActionState(connectMotilalAccount, initialState);
  const [apiKey, setApiKey] = React.useState("");
  const [portalPending, setPortalPending] = React.useState(false);
  const [portalError, setPortalError] = React.useState<string | null>(null);
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("motilal_error");

  React.useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  async function loginWithMotilal() {
    setPortalPending(true);
    setPortalError(null);
    const result = await startMotilalPortalLogin(apiKey);
    if (result.url) {
      window.location.href = result.url;
      return;
    }
    setPortalError(result.error ?? "Could not start the Motilal login.");
    setPortalPending(false);
  }

  return (
    <form action={formAction} className="grid gap-3">
      <div className="space-y-1">
        <Label htmlFor="mo-label" className="text-xs">Label (optional)</Label>
        <Input id="mo-label" name="label" placeholder="e.g. Main, Algo, Paper" />
      </div>
      <div className="space-y-1">
        <FieldLabel htmlFor="mo-client" help="invest.motilaloswal.com/moapi — your MOFSL trading account / login ID.">
          Motilal client code
        </FieldLabel>
        <Input id="mo-client" name="clientCode" placeholder="e.g. AA020" required />
        <p className="text-xs text-muted-foreground">
          Your MOFSL client code from the API portal — not the email you log into the website with.
        </p>
      </div>
      <div className="space-y-1">
        <FieldLabel
          htmlFor="mo-key"
          help="invest.motilaloswal.com/moapi → log in → create an API key (Trading API, Direct/self-built app). Activates automatically for retail clients."
        >
          {vendorKey ? "API key (not required)" : "API key"}
        </FieldLabel>
        <Input
          id="mo-key"
          name="apiKey"
          placeholder={vendorKey ? "Not needed — this deployment has a vendor key" : "From your Motilal API portal"}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          required={!vendorKey}
          disabled={vendorKey}
        />
      </div>
      <div className="space-y-1 rounded-md bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">
          Easiest path: log in on Motilal&rsquo;s own page — you type your MOFSL ID and password there,
          and Aether never sees them.{" "}
          {vendorKey
            ? "No API key needed: this deployment is registered with Motilal as a vendor."
            : "Needs your own API key above, and the redirect URL on your MO portal app set to /api/integrations/motilal/callback."}{" "}
          The token still expires 6 AM daily, so repeat it each trading morning (or save your password
          below to have Aether refresh it for you).
        </p>
        {(portalError || callbackError) && (
          <p className="text-sm text-negative">{portalError ?? callbackError}</p>
        )}
        <Button
          type="button"
          variant="outline"
          className="mt-1 w-fit"
          disabled={portalPending}
          onClick={loginWithMotilal}
        >
          {portalPending ? "Opening Motilal…" : "Log in with Motilal"}
        </Button>
      </div>
      <div className="space-y-1">
        <FieldLabel
          htmlFor="mo-password"
          help="Your MOFSL trading password. Stored encrypted and used only to mint MO's daily auth token — the token dies at 6 AM every day by exchange mandate, so without this you have to repaste one by hand each trading morning."
        >
          MOFSL password (for automatic daily tokens)
        </FieldLabel>
        <Input id="mo-password" name="password" type="password" autoComplete="off" />
        <p className="text-xs text-muted-foreground">
          Lets Aether refresh the daily auth token itself. Stored encrypted; needs the TOTP secret and
          2FA below if your account is an Investor account.
        </p>
      </div>
      <div className="space-y-1">
        <FieldLabel
          htmlFor="mo-token"
          help="Only needed if you'd rather not store your password. MO's login endpoint takes client code + SHA256(password + API key) + TOTP + 2FA and returns this token. Valid until 6 AM next day (hard daily reset) — regenerate and repaste each trading day."
        >
          Auth token (optional if password given)
        </FieldLabel>
        <Input id="mo-token" name="authToken" type="password" autoComplete="off" />
        <p className="text-xs text-muted-foreground">
          A 32-character token ending in <code>_M</code>, from your Motilal API portal. Expires 6 AM daily.
        </p>
      </div>
      <div className="space-y-1">
        <FieldLabel
          htmlFor="mo-totp"
          help="Motilal API portal dashboard shows a 32-character TOTP secret — paste the base32 setup key here (not the 6-digit code). Mandatory for Investor accounts."
        >
          TOTP Secret (base32, optional)
        </FieldLabel>
        <Input id="mo-totp" name="totpSecret" placeholder="ABCDEFGHIJKLMNOP..." />
        <p className="text-xs text-muted-foreground">
          The base32 setup code from your authenticator (&ldquo;Can&rsquo;t scan the QR?&rdquo;), not the
          6-digit OTP. Stored encrypted — used to show you a live code during reauth.
        </p>
      </div>
      <div className="space-y-1">
        <FieldLabel htmlFor="mo-2fa" help="Your registered DOB (dd/mm/yyyy) or PAN with Motilal Oswal. Mandatory for Investor accounts.">
          2FA (DOB or PAN, optional)
        </FieldLabel>
        <Input id="mo-2fa" name="twoFa" placeholder="dd/mm/yyyy or PAN" />
        <p className="text-xs text-muted-foreground">Mandatory for Investor accounts on Motilal&rsquo;s side.</p>
      </div>
      {state.error && <p className="text-sm text-negative">{state.error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Connecting…" : "Save connection"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ZerodhaConnectContent({ loginUrl }: { loginUrl: string }) {
  const searchParams = useSearchParams();
  const error = searchParams.get("zerodha_error");
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Access tokens expire daily — reconnect here whenever an account shows &quot;needs reauth&quot;.
      </p>
      {error && <p className="text-sm text-negative">{error}</p>}
      {loginUrl ? (
        <Button className="w-fit" render={<a href={loginUrl} />}>
          Connect with Zerodha
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          Set ZERODHA_API_KEY / ZERODHA_API_SECRET to enable this.
        </p>
      )}
    </div>
  );
}

function ZerodhaConnect({ loginUrl }: { loginUrl: string }) {
  return (
    <React.Suspense fallback={null}>
      <ZerodhaConnectContent loginUrl={loginUrl} />
    </React.Suspense>
  );
}

function ConnectDialog({
  provider,
  zerodhaLoginUrl,
  motilalVendorKey,
  onOpenChange,
  onSuccess,
}: {
  provider: ProviderMeta;
  zerodhaLoginUrl: string;
  motilalVendorKey: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{provider.name}</p>
          <DialogTitle>New {provider.name} connection</DialogTitle>
        </DialogHeader>
        {provider.id === "metaapi" && <MetaApiConnectForm onSuccess={onSuccess} />}
        {provider.id === "dhan" && <DhanConnectForm onSuccess={onSuccess} />}
        {provider.id === "motilal" && (
          // useSearchParams (the portal-login callback error) needs a boundary.
          <React.Suspense fallback={null}>
            <MotilalConnectForm onSuccess={onSuccess} vendorKey={motilalVendorKey} />
          </React.Suspense>
        )}
        {provider.id === "zerodha" && <ZerodhaConnect loginUrl={zerodhaLoginUrl} />}
      </DialogContent>
    </Dialog>
  );
}

function BrowseProvidersDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (provider: ProviderMeta) => void;
}) {
  const [query, setQuery] = React.useState("");
  const filtered = PROVIDERS.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">New connection</p>
          <DialogTitle>Browse providers</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Search providers…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto">
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              className="flex flex-col gap-1.5 rounded-lg border p-3 text-left hover:bg-muted/50"
              onClick={() => onPick(p)}
            >
              <div className="flex size-8 items-center justify-center rounded-md border font-medium">
                {p.name[0]}
              </div>
              <p className="font-medium">{p.name}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
              <p className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">Broker</p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProviderSection({
  meta,
  accounts,
  canManage,
  onAddAccount,
}: {
  meta: ProviderMeta;
  accounts: IntegrationAccount[];
  canManage: boolean;
  onAddAccount: () => void;
}) {
  const activeCount = accounts.filter((a) => a.status === "connected").length;

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md border font-medium">
            {meta.name[0]}
          </div>
          <div>
            <p className="font-medium">{meta.name}</p>
            <p className="text-xs text-muted-foreground">{meta.description}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {accounts.length > 0 && (
            <p className="hidden text-xs text-muted-foreground sm:block">
              {activeCount} active · {equityTotal(accounts)} equity
            </p>
          )}
          {canManage && (
            <Button size="sm" variant="outline" onClick={onAddAccount}>
              <Plus className="size-3.5" />
              Add account
            </Button>
          )}
        </div>
      </div>

      {accounts.length > 0 && (
        <div className="overflow-x-auto border-t">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 text-right font-medium">Balance</th>
                <th className="px-3 py-2 text-right font-medium">Equity</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Last sync</th>
                {canManage && <th className="px-3 py-2 text-right font-medium">Trading / sync</th>}
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <AccountRow
                  key={a.id}
                  account={a}
                  canManage={canManage}
                  columnCount={canManage ? 6 : 5}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function IntegrationsPanel({
  accounts,
  zerodhaLoginUrl,
  motilalVendorKey = false,
  canManage,
  canConnect,
  telegramConnections,
}: {
  accounts: IntegrationAccount[];
  zerodhaLoginUrl: string;
  /** Deployment holds a vendor API key, so users connect without supplying one. */
  motilalVendorKey?: boolean;
  canManage: boolean;
  canConnect: boolean;
  telegramConnections: TelegramConnection[];
}) {
  const router = useRouter();
  React.useEffect(() => {
    router.prefetch("/dashboard/settings?tab=integration");
  }, [router]);

  const [tab, setTab] = React.useState<"brokers" | "notifications">("brokers");
  const [browseOpen, setBrowseOpen] = React.useState(false);
  const [activeProvider, setActiveProvider] = React.useState<ProviderMeta | null>(null);

  const byProvider = (p: IntegrationAccount["provider"]) => accounts.filter((a) => a.provider === p);
  const connectedCount = accounts.filter((a) => a.status === "connected").length;

  function closeConnectDialogs() {
    setBrowseOpen(false);
    setActiveProvider(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Connections to brokers, data feeds and notification channels — shared by all members.
        </p>
      </div>

      {!canConnect && (
        <p className="text-xs text-muted-foreground">
          Your role can view connection status only — connecting or managing accounts needs an
          Integrations Manager, Admin, or Owner role.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-positive" />
            <span className="font-medium">{connectedCount}</span> of {accounts.length} connected
          </span>
          <span className="text-muted-foreground">|</span>
          <span className="text-muted-foreground">
            Aggregate equity{" "}
            <span className="font-medium text-foreground">{equityTotal(accounts)}</span>
          </span>
          <span className="text-muted-foreground">|</span>
          <span className="text-muted-foreground">
            Tick feed <span className="font-medium text-foreground">Bridge</span>
          </span>
        </div>
        {canConnect && (
          <Button onClick={() => setBrowseOpen(true)}>
            <Plus className="size-4" />
            Add connection
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "brokers" | "notifications")}>
        <TabsList>
          <TabsTrigger value="brokers">
            Brokers <Badge variant="secondary" className="ml-1">{accounts.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="notifications">
            Notifications <Badge variant="secondary" className="ml-1">{telegramConnections.length}</Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="brokers" className="mt-4 space-y-3">
          {PROVIDERS.map((meta) => (
            <ProviderSection
              key={meta.id}
              meta={meta}
              accounts={byProvider(meta.id)}
              canManage={canManage}
              onAddAccount={() => setActiveProvider(meta)}
            />
          ))}
        </TabsContent>
        <TabsContent value="notifications" className="mt-4">
          <div className="rounded-lg border p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-medium">Telegram</h3>
                <p className="text-sm text-muted-foreground">Deliver position notifications to chats and topics.</p>
              </div>
            </div>
            <TelegramPanel connections={telegramConnections} />
          </div>
        </TabsContent>
      </Tabs>

      {canConnect && browseOpen && (
        <BrowseProvidersDialog
          open={browseOpen}
          onOpenChange={(open) => (open ? setBrowseOpen(true) : setBrowseOpen(false))}
          onPick={(p) => {
            setBrowseOpen(false);
            setActiveProvider(p);
          }}
        />
      )}

      {canConnect && activeProvider && (
        <ConnectDialog
          provider={activeProvider}
          zerodhaLoginUrl={zerodhaLoginUrl}
          motilalVendorKey={motilalVendorKey}
          onOpenChange={(open) => !open && setActiveProvider(null)}
          onSuccess={closeConnectDialogs}
        />
      )}
    </div>
  );
}
