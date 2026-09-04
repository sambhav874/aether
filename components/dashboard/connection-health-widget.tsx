"use client";

import * as React from "react";
import { ChevronRight, Circle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/components/providers/appearance-provider";

export type ConnectionAccountStatus = {
  id: string;
  label: string;
  provider: "metaapi" | "zerodha" | "dhan" | "motilal";
  connected: boolean;
};

export function ConnectionHealthWidget({
  issueCount,
  healthPct,
  accounts,
}: {
  issueCount: number;
  healthPct: number;
  accounts: ConnectionAccountStatus[];
}) {
  const [open, setOpen] = React.useState(false);
  const { motion: appearanceMotion } = useAppearance();
  const reduced = appearanceMotion === "reduced";
  const healthy = issueCount === 0;

  return (
    <div className="mx-2 mb-2 overflow-hidden rounded-lg border border-sidebar-border bg-sidebar-accent/30 text-sidebar-foreground">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-xs"
      >
        <span className="relative flex size-2 shrink-0">
          {healthy && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-positive opacity-40" />
          )}
          <Circle
            className={cn(
              "relative size-2 shrink-0 fill-current",
              healthy ? "text-positive" : "text-negative",
            )}
          />
        </span>
        <span className="truncate font-medium">
          {issueCount} issue{issueCount === 1 ? "" : "s"} · {healthPct}%
        </span>
        <ChevronRight
          className={cn(
            "ml-auto size-3.5 shrink-0 transition-transform",
            open && "rotate-90",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduced ? undefined : { height: 0, opacity: 0 }}
            animate={reduced ? undefined : { height: "auto", opacity: 1 }}
            exit={reduced ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="max-h-48 overflow-y-auto border-t border-sidebar-border px-2 py-1.5">
              <p className="px-1 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                Connections
              </p>
              {accounts.length === 0 ? (
                <p className="px-1 py-1 text-xs text-muted-foreground">
                  No broker accounts connected yet.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {accounts.map((acct) => (
                    <li
                      key={acct.id}
                      className="flex items-center gap-2 rounded px-1 py-1 text-xs"
                    >
                      <Circle
                        className={cn(
                          "size-1.5 shrink-0 fill-current",
                          acct.connected ? "text-positive" : "text-negative",
                        )}
                      />
                      <span className="truncate">{acct.label}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {acct.connected ? "Connected" : "Disconnected"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
