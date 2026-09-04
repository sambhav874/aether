"use client";

import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { MarketTreemap } from "@/components/heatmap/market-treemap";
import { useAppearance } from "@/components/providers/appearance-provider";
import { tabPillTransition } from "@/lib/motion";
import type { CryptoHeatmapResult } from "@/lib/heatmap/coingecko";
import type { MarketHeatmapResult } from "@/lib/heatmap/types";

const CATEGORIES = [
  { value: "crypto", label: "Crypto" },
  { value: "us_equity", label: "US Equity 50" },
  { value: "india_fno", label: "India F&O 50" },
  { value: "india_equity", label: "India Equity" },
  { value: "india_broad", label: "India Broad" },
  { value: "commodities", label: "Commodities" },
  { value: "forex", label: "Forex" },
] as const;

type Tab = (typeof CATEGORIES)[number]["value"];

function toMarketResult(crypto: CryptoHeatmapResult): MarketHeatmapResult {
  if (crypto.status === "unavailable") return crypto;
  return {
    status: "ok",
    entries: crypto.entries.map((e) => ({
      symbol: e.symbol,
      name: e.name,
      price: e.price,
      value: e.marketCap,
      changePct: e.changePct24h,
    })),
  };
}

function UnavailablePanel({ source, reason }: { source: string; reason: string }) {
  return (
    <div className="rounded-lg border border-dashed p-12 text-center">
      <p className="font-medium">Data unavailable</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {source} didn&rsquo;t return data ({reason}) — try again shortly.
      </p>
    </div>
  );
}

export function HeatmapPage({
  crypto,
  usEquity,
  indiaFno,
  indiaEquity,
  indiaBroad,
  commodities,
  forex,
}: {
  crypto: CryptoHeatmapResult;
  usEquity: MarketHeatmapResult;
  indiaFno: MarketHeatmapResult;
  indiaEquity: MarketHeatmapResult;
  indiaBroad: MarketHeatmapResult;
  commodities: MarketHeatmapResult;
  forex: MarketHeatmapResult;
}) {
  const [tab, setTab] = React.useState<Tab>("crypto");
  const { motion: appearanceMotion } = useAppearance();
  const reduced = appearanceMotion === "reduced";

  const results: Record<Tab, { result: MarketHeatmapResult; source: string }> = {
    crypto: { result: toMarketResult(crypto), source: "CoinGecko" },
    us_equity: { result: usEquity, source: "Yahoo Finance" },
    india_fno: { result: indiaFno, source: "Yahoo Finance" },
    india_equity: { result: indiaEquity, source: "Yahoo Finance" },
    india_broad: { result: indiaBroad, source: "Yahoo Finance" },
    commodities: { result: commodities, source: "Yahoo Finance" },
    forex: { result: forex, source: "Yahoo Finance" },
  };

  const active = results[tab];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Heatmap</h1>
        <p className="text-sm text-muted-foreground">
          Market-cap treemap colored by 24h change — box size is market cap (or dollar volume for
          non-crypto), color is direction.
        </p>
      </div>

      <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setTab(c.value)}
            className={cn(
              "relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === c.value ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab === c.value && (
              <motion.span
                layoutId={reduced ? undefined : "heatmap-tab-pill"}
                className="absolute inset-0 rounded-md bg-primary"
                transition={reduced ? { duration: 0 } : tabPillTransition}
              />
            )}
            <span className="relative">{c.label}</span>
          </button>
        ))}
      </div>

      {active.result.status === "ok" ? (
        <motion.div
          key={tab}
          initial={reduced ? undefined : { opacity: 0, scale: 0.98 }}
          animate={reduced ? undefined : { opacity: 1, scale: 1 }}
          transition={reduced ? { duration: 0 } : { duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <MarketTreemap entries={active.result.entries} />
        </motion.div>
      ) : (
        <UnavailablePanel source={active.source} reason={active.result.reason} />
      )}
    </div>
  );
}
