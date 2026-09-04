"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveNotificationPreferences, type NotificationPrefs } from "@/lib/settings/actions";

const ROWS: { key: keyof NotificationPrefs; label: string; description: string; locked?: boolean }[] = [
  {
    key: "signalAlerts",
    label: "Strategy signals",
    description: "A webhook signal was received and dispatched (or rejected).",
  },
  {
    key: "brokerDisconnected",
    label: "Broker disconnected",
    description: "A connected broker account needs reauth or fell out of sync.",
  },
  {
    key: "strategyPaused",
    label: "Strategy paused",
    description: "A strategy was paused and stopped dispatching signals.",
  },
  {
    key: "securityAlerts",
    label: "Security alerts",
    description: "Password changes, 2FA changes, new sign-ins. Always on.",
    locked: true,
  },
];

export function NotificationsForm({ initial }: { initial: NotificationPrefs }) {
  const [prefs, setPrefs] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();
  const [saved, setSaved] = React.useState(false);

  function toggle(key: keyof NotificationPrefs, value: boolean) {
    if (key === "securityAlerts") return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSaved(false);
    startTransition(async () => {
      await saveNotificationPreferences(next);
      setSaved(true);
    });
  }

  return (
    <div className="max-w-md space-y-1">
      <p className="mb-3 text-xs text-muted-foreground">
        These control what gets sent to any active Telegram connections below. Email delivery isn&rsquo;t
        wired up yet.
      </p>
      {ROWS.map((row) => (
        <div key={row.key} className="flex items-center justify-between border-b py-3 last:border-0">
          <div>
            <Label htmlFor={row.key}>{row.label}</Label>
            <p className="text-xs text-muted-foreground">{row.description}</p>
          </div>
          <Switch
            id={row.key}
            checked={row.key === "securityAlerts" ? true : prefs[row.key]}
            disabled={row.locked || pending}
            onCheckedChange={(checked) => toggle(row.key, checked)}
          />
        </div>
      ))}
      {saved && <p className="pt-2 text-xs text-positive">Saved.</p>}
    </div>
  );
}
