"use client";

import * as React from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

const tickers = [
  { sym: "NIFTY 50", px: "24,812.40", chg: "+0.84%" },
  { sym: "BANKNIFTY", px: "53,190.15", chg: "+1.12%" },
  { sym: "RELIANCE", px: "2,942.80", chg: "-0.36%" },
  { sym: "TCS", px: "4,118.05", chg: "+1.94%" },
  { sym: "HDFCBANK", px: "1,688.20", chg: "+0.41%" },
  { sym: "INFY", px: "1,902.55", chg: "+2.28%" },
  { sym: "USDINR", px: "83.42", chg: "-0.08%" },
  { sym: "GOLD", px: "72,410", chg: "+0.62%" },
  { sym: "BTCUSD", px: "68,204", chg: "-1.44%" },
  { sym: "CRUDE", px: "6,712", chg: "+0.97%" },
];

/** Two ticker rails that slide in opposite directions as the band scrolls past. */
export function MarketBand() {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const leftRaw = useTransform(scrollYProgress, [0, 1], ["2%", "-22%"]);
  const rightRaw = useTransform(scrollYProgress, [0, 1], ["-22%", "2%"]);
  const spring = { stiffness: 110, damping: 30, restDelta: 0.001 };
  const left = useSpring(leftRaw, spring);
  const right = useSpring(rightRaw, spring);

  const row = [...tickers, ...tickers];

  return (
    <div
      ref={ref}
      className="relative overflow-hidden border-y border-[#1c1d22] bg-[#040406] py-10"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-[#040406] to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-[#040406] to-transparent"
      />

      <motion.div
        className="flex w-max gap-10 whitespace-nowrap"
        style={reduced ? undefined : { x: left }}
      >
        {row.map((t, i) => (
          <TickerCell key={`a-${t.sym}-${i}`} {...t} />
        ))}
      </motion.div>

      <motion.div
        className="mt-6 flex w-max gap-10 whitespace-nowrap"
        style={reduced ? undefined : { x: right }}
      >
        {row.map((t, i) => (
          <TickerCell key={`b-${t.sym}-${i}`} {...t} muted />
        ))}
      </motion.div>
    </div>
  );
}

function TickerCell({
  sym,
  px,
  chg,
  muted,
}: {
  sym: string;
  px: string;
  chg: string;
  muted?: boolean;
}) {
  const up = chg.startsWith("+");
  return (
    <span className={cn("flex items-baseline gap-3 text-sm", muted && "opacity-45")}>
      <span className="font-medium tracking-[0.02em] text-[#e2e3e9]">{sym}</span>
      <span className="text-[#777a88] tabular-nums">{px}</span>
      <span className={cn("tabular-nums", up ? "text-[#4ade80]" : "text-[#e06c5b]")}>
        {chg}
      </span>
      <span aria-hidden className="text-[#2e3038]">/</span>
    </span>
  );
}
