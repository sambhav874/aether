"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { staggerItem } from "@/lib/motion";
import { AnimatedNumber } from "@/components/motion/animated-number";

export function SummaryCard({
  title,
  badge,
  primary,
  primaryNumeric,
  primaryFormat,
  primaryTone,
  breakdown,
  meta,
  footnote,
}: {
  title: string;
  badge?: { label: string; tone: "live" | "open" | "muted" };
  primary: string;
  primaryNumeric?: number;
  primaryFormat?: (n: number) => string;
  primaryTone: "positive" | "negative" | "neutral";
  breakdown: ReactNode;
  meta?: string;
  footnote: string;
}) {
  return (
    <motion.div
      variants={staggerItem}
      className="card-elevated rounded-lg border border-border/70 bg-card p-4"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </span>
        {badge && (
          <span
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium",
              badge.tone === "live" && "text-positive",
              badge.tone === "open" && "text-positive",
              badge.tone === "muted" && "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                badge.tone === "muted" ? "bg-muted-foreground" : "bg-positive",
              )}
            />
            {badge.label}
          </span>
        )}
      </div>

      <p
        className={cn(
          "font-display mt-2 text-3xl font-medium tracking-tight",
          primaryTone === "positive" && "text-positive",
          primaryTone === "negative" && "text-negative",
        )}
      >
        {primaryNumeric !== undefined && primaryFormat ? (
          <AnimatedNumber value={primaryNumeric} format={primaryFormat} />
        ) : (
          primary
        )}
      </p>

      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
        <div className="tabular-figures">{breakdown}</div>
        {meta && <span>{meta}</span>}
      </div>

      <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">{footnote}</p>
    </motion.div>
  );
}
