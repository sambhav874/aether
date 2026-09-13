"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { OctagonX, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { haltTrading, resumeTrading } from "@/lib/strategies/halt-actions";
import type { HaltState } from "@/lib/strategies/halt";

/**
 * Emergency stop, in the topbar because the one control you reach for under
 * pressure should not be behind a menu. When a halt is active it is the
 * loudest thing on the page — a halted platform that looks normal is worse
 * than no kill switch at all.
 */
export function HaltControl({ initialState }: { initialState: HaltState }) {
  const router = useRouter();
  const [state, setState] = React.useState(initialState);
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Adjust during render rather than in an effect: the server re-resolves the
  // halt on every navigation, and syncing in an effect paints one frame of the
  // stale state first — for this control that frame says trading is running.
  const [syncedFrom, setSyncedFrom] = React.useState(initialState);
  if (syncedFrom !== initialState) {
    setSyncedFrom(initialState);
    setState(initialState);
  }

  function onHalt() {
    setError(null);
    startTransition(async () => {
      const result = await haltTrading(reason);
      if (result.error) return setError(result.error);
      setOpen(false);
      setReason("");
      setState({ halted: true, scope: "workspace", reason });
      router.refresh();
    });
  }

  function onResume() {
    setError(null);
    startTransition(async () => {
      const result = await resumeTrading();
      if (result.error) return setError(result.error);
      setState({ halted: false });
      router.refresh();
    });
  }

  if (state.halted) {
    const platformWide = state.scope === "platform";
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-sm bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
          <OctagonX className="size-3.5" />
          {platformWide ? "Trading halted platform-wide" : "Trading halted"}
        </span>
        {/* A platform halt is not this workspace's to lift. */}
        {!platformWide && (
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={pending} onClick={onResume}>
            <Play className="size-3" />
            Resume
          </Button>
        )}
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <OctagonX className="size-3" />
        Halt trading
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Halt all trading</DialogTitle>
            <DialogDescription>
              Every incoming signal is rejected until you resume — across all strategies and
              every connected broker account. Positions already open are left alone; this stops
              new orders, it does not close anything.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="halt-reason">Reason</Label>
            <Input
              id="halt-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. bad signals from TradingView alert"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Recorded against the halt. It&apos;s what you&apos;ll be reading back afterwards.
            </p>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={onHalt} disabled={pending || !reason.trim()}>
              {pending ? "Halting…" : "Halt trading"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
