"use client";

import * as React from "react";
import { authClient, useSession } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

function PasswordForm() {
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [status, setStatus] = React.useState<{ error?: string; success?: boolean }>({});
  const [pending, startTransition] = React.useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus({});
    startTransition(async () => {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (result.error) {
        setStatus({ error: result.error.message ?? "Could not change password." });
      } else {
        setStatus({ success: true });
        setCurrentPassword("");
        setNewPassword("");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <h3 className="text-sm font-semibold">Password</h3>
      <div className="space-y-1.5">
        <Label htmlFor="current-password">Current password</Label>
        <Input
          id="current-password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          minLength={8}
          required
        />
      </div>
      {status.error && <p className="text-sm text-negative">{status.error}</p>}
      {status.success && (
        <p className="text-sm text-positive">Password changed — other sessions were signed out.</p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Updating…" : "Change password"}
      </Button>
    </form>
  );
}

function TwoFactorSetup({ onDone }: { onDone: () => void }) {
  const [step, setStep] = React.useState<"password" | "verify">("password");
  const [password, setPassword] = React.useState("");
  const [totpURI, setTotpURI] = React.useState("");
  const [backupCodes, setBackupCodes] = React.useState<string[]>([]);
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function handleEnable(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await authClient.twoFactor.enable({ password });
      if (result.error) {
        setError(result.error.message ?? "Could not start 2FA setup.");
        return;
      }
      setTotpURI(result.data.totpURI);
      setBackupCodes(result.data.backupCodes);
      setStep("verify");
    });
  }

  function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await authClient.twoFactor.verifyTotp({ code });
      if (result.error) {
        setError(result.error.message ?? "Invalid code.");
        return;
      }
      onDone();
    });
  }

  if (step === "password") {
    return (
      <form onSubmit={handleEnable} className="max-w-md space-y-3 rounded-md border p-3">
        <p className="text-xs text-muted-foreground">Confirm your password to start setup.</p>
        <Input
          type="password"
          placeholder="Current password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-sm text-negative">{error}</p>}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Starting…" : "Continue"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleVerify} className="max-w-md space-y-3 rounded-md border p-3">
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">1. Add this to your authenticator app</p>
        <p className="rounded-md border bg-muted/30 p-2 text-xs break-all">{totpURI}</p>
        <p className="text-xs text-muted-foreground">
          Paste this URI into an authenticator app that supports manual entry (or a QR-from-text
          tool), e.g. 1Password, Google Authenticator, Authy.
        </p>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">2. Save your backup codes</p>
        <div className="grid grid-cols-2 gap-1 rounded-md border bg-muted/30 p-2 font-mono text-xs">
          {backupCodes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Each code works once if you lose access to your authenticator. Store them somewhere safe —
          they won&rsquo;t be shown again.
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="totp-code" className="text-xs">
          3. Enter the 6-digit code from your app
        </Label>
        <Input
          id="totp-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={6}
          required
        />
      </div>
      {error && <p className="text-sm text-negative">{error}</p>}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Verifying…" : "Verify and enable"}
      </Button>
    </form>
  );
}

function TwoFactorSection() {
  const { data: session, isPending, refetch } = useSession();
  const [enabling, setEnabling] = React.useState(false);
  const [disablePassword, setDisablePassword] = React.useState("");
  const [disabling, setDisabling] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  if (isPending) return <Skeleton className="h-24 w-full max-w-md" />;

  const enabled = Boolean(session?.user.twoFactorEnabled);

  function handleDisable(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await authClient.twoFactor.disable({ password: disablePassword });
      if (result.error) {
        setError(result.error.message ?? "Could not disable 2FA.");
        return;
      }
      setDisabling(false);
      setDisablePassword("");
      refetch();
    });
  }

  return (
    <div className="max-w-md space-y-3">
      <h3 className="text-sm font-semibold">Two-factor authentication</h3>
      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <p className="text-sm font-medium">{enabled ? "Enabled" : "Not enabled"}</p>
          <p className="text-xs text-muted-foreground">
            {enabled ? "Your account requires a TOTP code at sign-in." : "Add an authenticator-app second factor."}
          </p>
        </div>
        {!enabled && !enabling && (
          <Button size="sm" variant="outline" onClick={() => setEnabling(true)}>
            Enable
          </Button>
        )}
        {enabled && !disabling && (
          <Button size="sm" variant="outline" onClick={() => setDisabling(true)}>
            Disable
          </Button>
        )}
      </div>

      {!enabled && enabling && (
        <TwoFactorSetup
          onDone={() => {
            setEnabling(false);
            refetch();
          }}
        />
      )}

      {enabled && disabling && (
        <form onSubmit={handleDisable} className="space-y-3 rounded-md border p-3">
          <Input
            type="password"
            placeholder="Current password"
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-negative">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="destructive" disabled={pending}>
              {pending ? "Disabling…" : "Confirm disable"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setDisabling(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function SecurityForm() {
  return (
    <div className="space-y-6">
      <PasswordForm />
      <Separator className="max-w-md" />
      <TwoFactorSection />
    </div>
  );
}
