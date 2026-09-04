"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { shareStrategy, getShareableMembers } from "@/lib/strategies/detail-actions";
import type { ShareEntry } from "@/lib/strategies/types";

const LEVEL_LABEL: Record<ShareEntry["permission"], string> = {
  none: "No access",
  view: "View only",
  view_execute: "View + Execute",
  edit_execute: "Edit + Execute",
  co_owner: "Co-owner",
};

const LEVEL_DESCRIPTION: Record<ShareEntry["permission"], string> = {
  none: "Member cannot see this strategy or its positions.",
  view: "Sees strategy + its positions; cannot modify configs or trigger signals.",
  view_execute: "View access plus the ability to manually trigger or close.",
  edit_execute: "Can edit trade-config, strategy-config, and chart settings.",
  co_owner: "Full control including sharing and deleting.",
};

export function ShareDialog({
  strategyId,
  strategyName,
  open,
  onOpenChange,
}: {
  strategyId: string;
  strategyName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [members, setMembers] = React.useState<ShareEntry[] | null>(null);
  const [pendingUserId, setPendingUserId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) getShareableMembers(strategyId).then(setMembers);
  }, [open, strategyId]);

  async function handleChange(userId: string, permission: ShareEntry["permission"]) {
    setPendingUserId(userId);
    await shareStrategy(strategyId, userId, permission);
    setMembers((prev) => prev?.map((m) => (m.userId === userId ? { ...m, permission } : m)) ?? null);
    setPendingUserId(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share — {strategyName}</DialogTitle>
          <DialogDescription>Grant workspace members access to this strategy.</DialogDescription>
        </DialogHeader>

        {members === null ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Loading members…</p>
        ) : members.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            No other members in this workspace yet.
          </p>
        ) : (
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                </div>
                <Select
                  value={m.permission}
                  onValueChange={(v) => v && handleChange(m.userId, v as ShareEntry["permission"])}
                >
                  <SelectTrigger size="sm" className="w-40 shrink-0" disabled={pendingUserId === m.userId}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(LEVEL_LABEL) as ShareEntry["permission"][]).map((level) => (
                      <SelectItem key={level} value={level}>
                        <span className="flex flex-col">
                          <span>{LEVEL_LABEL[level]}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1 rounded-lg border bg-muted/30 p-2.5 text-xs text-muted-foreground">
          {(Object.keys(LEVEL_LABEL) as ShareEntry["permission"][]).map((level) => (
            <p key={level}>
              <span className="font-medium text-foreground">{LEVEL_LABEL[level]}</span> — {LEVEL_DESCRIPTION[level]}
            </p>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
