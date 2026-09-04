"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { updateStrategyNotifications, getWorkspaceTelegramChannels } from "@/lib/strategies/detail-actions";
import type { NotificationPrefRow, NotificationEvent } from "@/lib/strategies/types";

const EVENT_LABEL: Record<NotificationEvent, { title: string; description: string }> = {
  entry: { title: "Entry", description: "When a position opens for this strategy." },
  partial: { title: "Partial", description: "When a partial booking fires." },
  exit: { title: "Exit", description: "When a position fully closes." },
};

export function NotificationsDialog({
  strategyId,
  strategyName,
  initial,
  open,
  onOpenChange,
}: {
  strategyId: string;
  strategyName: string;
  initial: NotificationPrefRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [prefs, setPrefs] = React.useState(initial);
  const [channels, setChannels] = React.useState<{ id: string; label: string }[]>([]);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (open) getWorkspaceTelegramChannels().then(setChannels);
  }, [open]);

  function updatePref(event: NotificationEvent, patch: Partial<NotificationPrefRow>) {
    setPrefs((prev) => prev.map((p) => (p.event === event ? { ...p, ...patch } : p)));
  }

  function toggleChannel(event: NotificationEvent, channelId: string) {
    setPrefs((prev) =>
      prev.map((p) => {
        if (p.event !== event) return p;
        const has = p.telegramConnectionIds.includes(channelId);
        return {
          ...p,
          telegramConnectionIds: has
            ? p.telegramConnectionIds.filter((id) => id !== channelId)
            : [...p.telegramConnectionIds, channelId],
        };
      }),
    );
  }

  function handleSave() {
    startTransition(async () => {
      await updateStrategyNotifications(strategyId, prefs);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Notifications — {strategyName}</DialogTitle>
          <DialogDescription>Choose how this strategy notifies you on each position event.</DialogDescription>
        </DialogHeader>

        <div className="max-h-[26rem] space-y-5 overflow-y-auto pr-1">
          {prefs.map((pref) => (
            <div key={pref.event} className="space-y-2 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{EVENT_LABEL[pref.event].title}</p>
                <p className="text-xs text-muted-foreground">{EVENT_LABEL[pref.event].description}</p>
              </div>
              {(["email", "telegram", "push"] as const).map((channel) => (
                <div key={channel} className="flex items-center justify-between">
                  <span className="text-sm capitalize">{channel}</span>
                  <Switch
                    checked={pref[channel]}
                    onCheckedChange={(checked) => updatePref(pref.event, { [channel]: checked })}
                  />
                </div>
              ))}
              {pref.telegram && (
                <div className="space-y-1 pt-1">
                  <p className="text-xs text-muted-foreground">Telegram channels</p>
                  {channels.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No Telegram channels connected.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {channels.map((c) => {
                        const active = pref.telegramConnectionIds.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleChannel(pref.event, c.id)}
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Saving…" : "Save notifications"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
