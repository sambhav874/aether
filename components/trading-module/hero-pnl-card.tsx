"use client";

import { motion } from "motion/react";
import { TrendingUp, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { staggerItem } from "@/lib/motion";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { formatMoney } from "@/lib/format";

export function HeroPnlCard({
  realizedPnl,
  unrealizedPnl,
  currency,
}: {
  realizedPnl: number;
  unrealizedPnl: number;
  currency: "USD" | "INR";
}) {
  const net = realizedPnl + unrealizedPnl;
  const tone = net > 0 ? "positive" : net < 0 ? "negative" : "neutral";

  return (
    <motion.div
      variants={staggerItem}
      className="card-elevated rounded-lg border border-border/70 bg-card p-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Net P&amp;L
          </span>
          <p
            className={cn(
              "font-display mt-1 text-4xl font-medium tracking-tight",
              tone === "positive" && "text-positive",
              tone === "negative" && "text-negative",
            )}
          >
            <AnimatedNumber value={net} format={(n) => formatMoney(n, currency)} />
          </p>
        </div>

        <div className="flex gap-6">
          <div>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="size-3.5" />
              Realized
            </span>
            <p
              className={cn(
                "tabular-figures mt-0.5 text-lg font-semibold",
                realizedPnl > 0 && "text-positive",
                realizedPnl < 0 && "text-negative",
              )}
            >
              {formatMoney(realizedPnl, currency)}
            </p>
          </div>
          <div>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet className="size-3.5" />
              Unrealized
            </span>
            <p
              className={cn(
                "tabular-figures mt-0.5 text-lg font-semibold",
                unrealizedPnl > 0 && "text-positive",
                unrealizedPnl < 0 && "text-negative",
              )}
            >
              {formatMoney(unrealizedPnl, currency)}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
