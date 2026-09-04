"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LinkableAccount } from "@/lib/strategies/accounts";
import { setLinkedAccounts } from "@/lib/strategies/actions";

const PROVIDER_LABEL: Record<LinkableAccount["provider"], string> = {
  metaapi: "Bridge (MT5)",
  zerodha: "Zerodha",
  dhan: "Dhan",
  motilal: "Motilal Oswal",
};

export function LinkedAccountsDialog({
  strategyId,
  strategyMarket,
  accounts,
  linkedAccountIds,
  open,
  onOpenChange,
}: {
  strategyId: string;
  strategyMarket: string;
  accounts: LinkableAccount[];
  linkedAccountIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // The parent only mounts this component while `linking` is set (see
  // strategy-list.tsx), so a fresh instance — and a fresh initial value
  // here — is guaranteed each time it opens; no effect needed to resync it.
  const [selected, setSelected] = React.useState<Set<string>>(new Set(linkedAccountIds));
  const [pending, startTransition] = React.useTransition();

  function toggle(accountId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }

  function handleSave() {
    startTransition(async () => {
      await setLinkedAccounts(strategyId, Array.from(selected));
      onOpenChange(false);
    });
  }

  const relevant = accounts.filter((a) => a.status === "connected");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Linked accounts</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Signals for this strategy dispatch to every account checked below.
        </p>

        {relevant.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            No connected broker accounts in this workspace yet.
          </p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
            {relevant.map((account) => (
              <label
                key={account.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <input
                  type="checkbox"
                  checked={selected.has(account.id)}
                  onChange={() => toggle(account.id)}
                  className="size-4"
                />
                <span className="font-medium">{account.label}</span>
                <span className="text-xs text-muted-foreground">
                  {PROVIDER_LABEL[account.provider]}
                </span>
              </label>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Market: <span className="font-medium">{strategyMarket}</span> — linking an account from a
          different market&rsquo;s broker won&rsquo;t reject here, but its orders will.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
