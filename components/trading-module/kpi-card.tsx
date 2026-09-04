"use client";

import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { staggerItem } from "@/lib/motion";
import { AnimatedNumber } from "@/components/motion/animated-number";

export type KpiTone = "neutral" | "positive" | "negative";

export function KpiCard({
  icon: Icon,
  label,
  value,
  numeric,
  format,
  caption,
  tone = "neutral",
  size = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  numeric?: number;
  format?: (n: number) => string;
  caption?: string;
  tone?: KpiTone;
  size?: "default" | "sm";
}) {
  return (
    <motion.div
      variants={staggerItem}
      className={cn(
        "card-elevated rounded-lg border border-border/70 bg-card",
        size === "sm" ? "p-3" : "p-4",
      )}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        <span>{label}</span>
      </div>
      <p
        className={cn(
          "tabular-figures mt-1.5 font-semibold",
          size === "sm" ? "text-lg" : "text-2xl",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
        )}
      >
        {numeric !== undefined && format ? (
          <AnimatedNumber value={numeric} format={format} />
        ) : (
          value
        )}
      </p>
      {caption && <p className="mt-1 text-xs text-muted-foreground">{caption}</p>}
    </motion.div>
  );
}
