"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchSignalHistory, confirmSignal, rejectSignal } from "@/lib/strategies/actions";
import type { SignalRow } from "@/lib/strategies/types";

function formatTime(date: Date) {
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_VARIANT: Record<SignalRow["status"], "default" | "secondary" | "destructive"> = {
  received: "default",
  pending_confirmation: "secondary",
  rejected: "destructive",
};

export function SignalHistoryDialog({
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
  const [signals, setSignals] = React.useState<SignalRow[] | null>(null);
  const [pending, startTransition] = React.useTransition();

  const reload = React.useCallback(() => {
    startTransition(async () => {
      setSignals(await fetchSignalHistory(strategyId));
    });
  }, [strategyId]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Signal history — {strategyName}</DialogTitle>
        </DialogHeader>

        {signals === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : signals.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No signals received yet.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Symbol</th>
                  <th className="px-3 py-2 font-medium">Tag</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {signals.map((signal) => (
                  <tr key={signal.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {formatTime(signal.receivedAt)}
                    </td>
                    <td className="px-3 py-2 font-medium">{signal.action}</td>
                    <td className="px-3 py-2">{signal.symbol}</td>
                    <td className="px-3 py-2 text-muted-foreground">{signal.tag ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_VARIANT[signal.status]}>
                        {signal.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className={cn("max-w-xs px-3 py-2 text-xs text-muted-foreground")}>
                      {signal.resultMessage ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {signal.status === "pending_confirmation" && (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => startTransition(async () => { await confirmSignal(signal.id); reload(); })}
                          >
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => startTransition(async () => { await rejectSignal(signal.id); reload(); })}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
