"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Crown, Gauge, LineChart, ShieldCheck } from "lucide-react";
import { GildedChart } from "@/components/landing/gilded-chart";
import { useScrollSteps } from "@/components/landing/scroll";
import { cn } from "@/lib/utils";

const steps = [
  {
    icon: Gauge,
    eyebrow: "01 — Route",
    title: "Price every venue, then fill.",
    body: "Orders are quoted across connected venues on each tick and routed to the tightest book. No manual venue-hopping, no stale quotes.",
    stat: { label: "Median fill", value: "180ms" },
  },
  {
    icon: Crown,
    eyebrow: "02 — Automate",
    title: "Codify the rules once.",
    body: "Entries, exits, sizing, and kill-switches described in plain rules. Monarch runs them across every symbol you watch, all session.",
    stat: { label: "Strategies live", value: "3,400+" },
  },
  {
    icon: ShieldCheck,
    eyebrow: "03 — Contain",
    title: "Risk stops it before the desk does.",
    body: "Margin, exposure, and drawdown ceilings are enforced pre-trade. A breached limit never reaches the exchange.",
    stat: { label: "Pre-trade checks", value: "17" },
  },
  {
    icon: LineChart,
    eyebrow: "04 — Reconcile",
    title: "One ledger, every broker.",
    body: "P&L, exposure, and attribution folded into a single reconciled book — the number you read is the number that settled.",
    stat: { label: "Brokers unified", value: "12" },
  },
];

const chartPoints = [
  "0,110 50,96 100,102 150,74 200,86 250,52 300,64 350,30 400,38",
  "0,120 50,88 100,94 150,58 200,66 250,40 300,44 350,18 400,24",
  "0,96 50,104 100,78 150,88 200,54 250,66 300,34 350,44 400,20",
  "0,130 50,112 100,90 150,96 200,62 250,48 300,36 350,26 400,10",
];

export function PinnedStory() {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { active } = useScrollSteps(ref, steps.length);
  const step = steps[active];

  return (
    <div ref={ref} className="relative" style={{ height: `${steps.length * 90}vh` }}>
      <div className="sticky top-0 flex min-h-svh items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-[1216px] items-center gap-16 px-6 py-24 lg:grid-cols-[0.95fr_1.05fr]">
          {/* left: stepped copy */}
          <div>
            <p className="text-[13px] font-semibold tracking-[-0.26px] text-[#cc9166]">
              How it works
            </p>

            <div className="relative mt-6 min-h-[280px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  initial={reduced ? undefined : { opacity: 0, y: 18, filter: "blur(6px)" }}
                  animate={reduced ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={reduced ? undefined : { opacity: 0, y: -14, filter: "blur(6px)" }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                >
                  <p className="text-[13px] font-semibold tracking-[-0.26px] text-[#5e616e]">
                    {step.eyebrow}
                  </p>
                  <h3 className="mt-4 text-[32px] leading-[1.13] tracking-[0.01em] [font-family:var(--font-landing-serif)] sm:text-[44px] lg:text-[52px]">
                    {step.title}
                  </h3>
                  <p className="mt-6 max-w-[46ch] text-[18px] leading-[1.38] tracking-[-0.8px] text-[#9194a1] sm:text-[20px]">
                    {step.body}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* step rail */}
            <div className="mt-10 flex gap-3">
              {steps.map((s, i) => (
                <div key={s.eyebrow} className="h-px flex-1 bg-[#1c1d22]">
                  <motion.div
                    className="h-px origin-left bg-[#cc9166]"
                    animate={{ scaleX: i <= active ? 1 : 0 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* right: live-ish panel */}
          <div className="relative rounded-[10px] border border-[#1c1d22] bg-[#08080a] p-6">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-[#cc9166] opacity-[0.10] blur-[110px]"
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <motion.span
                  key={`icon-${active}`}
                  initial={reduced ? undefined : { scale: 0.7, opacity: 0 }}
                  animate={reduced ? undefined : { scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="flex size-9 items-center justify-center rounded-full text-[#777a88] shadow-[0_0_0_1px_rgba(255,255,255,0.2)]"
                >
                  <step.icon className="size-4" strokeWidth={1} />
                </motion.span>
                <p className="text-[16px] font-medium text-white">Aether desk</p>
              </div>
              <span className="flex items-center gap-2 rounded-full border border-[#2e3038] px-2.5 py-1 text-[13px] text-[#9194a1]">
                <span className="size-1.5 animate-pulse rounded-full bg-[#4ade80]" />
                Live
              </span>
            </div>

            <motion.div
              key={`chart-${active}`}
              initial={reduced ? undefined : { opacity: 0 }}
              animate={reduced ? undefined : { opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <GildedChart
                id={`story-${active}`}
                className="mt-8 h-40 w-full"
                points={chartPoints[active]}
              />
            </motion.div>

            <div className="mt-8 grid grid-cols-2 gap-6 border-t border-[#1c1d22] pt-6 sm:grid-cols-4">
              {steps.map((s, i) => (
                <div key={s.stat.label}>
                  <p className="text-[13px] text-[#5e616e]">{s.stat.label}</p>
                  <p
                    className={cn(
                      "mt-1 text-[16px] font-medium transition-colors duration-500",
                      i === active ? "text-[#fff0cc]" : "text-[#464853]",
                    )}
                  >
                    {s.stat.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
