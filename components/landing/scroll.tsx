"use client";

import * as React from "react";
import {
  motion,
  useInView,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Gilded progress rail pinned to the top of the viewport. */
export function ScrollRail() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 220,
    damping: 40,
    restDelta: 0.001,
  });

  return (
    <motion.div
      aria-hidden
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-px origin-left bg-[linear-gradient(103deg,#ae9357_0%,#fff0cc_40%,#ae9357_70%,rgba(189,157,79,0)_100%)]"
    />
  );
}

/** Fade + rise as the element enters the viewport. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  as?: "div" | "section" | "li" | "span" | "p";
}) {
  const reduced = useReducedMotion();
  const M = motion[Tag] as typeof motion.div;

  return (
    <M
      className={className}
      initial={reduced ? undefined : { opacity: 0, y }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-12% 0px -8% 0px" }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </M>
  );
}

/** Scroll-linked vertical translation. `speed` > 0 lags, < 0 leads. */
export function Parallax({
  children,
  className,
  speed = 0.2,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  speed?: number;
  style?: React.CSSProperties;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const raw = useTransform(scrollYProgress, [0, 1], [speed * 160, speed * -160]);
  const y = useSpring(raw, { stiffness: 120, damping: 30, restDelta: 0.5 });

  return (
    <motion.div
      ref={ref}
      className={className}
      style={reduced ? style : { ...style, y }}
    >
      {children}
    </motion.div>
  );
}

/** Word-by-word ignition driven by scroll position through the block. */
export function ScrollText({
  text,
  className,
  accent = [],
}: {
  text: string;
  className?: string;
  /** Word indices painted copper once lit. */
  accent?: number[];
}) {
  const ref = React.useRef<HTMLParagraphElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.85", "end 0.45"],
  });
  const words = React.useMemo(() => text.split(" "), [text]);
  const accentSet = React.useMemo(() => new Set(accent), [accent]);

  return (
    <p ref={ref} className={className}>
      {words.map((word, i) => (
        <React.Fragment key={`${word}-${i}`}>
          <ScrollWord
            word={word}
            index={i}
            total={words.length}
            progress={scrollYProgress}
            accent={accentSet.has(i)}
            reduced={!!reduced}
          />
          {i < words.length - 1 ? " " : null}
        </React.Fragment>
      ))}
    </p>
  );
}

function ScrollWord({
  word,
  index,
  total,
  progress,
  accent,
  reduced,
}: {
  word: string;
  index: number;
  total: number;
  progress: MotionValue<number>;
  accent: boolean;
  reduced: boolean;
}) {
  const start = index / total;
  const end = start + 1.6 / total;
  const opacity = useTransform(progress, [start, end], [0.16, 1]);
  const blur = useTransform(progress, [start, end], ["blur(5px)", "blur(0px)"]);

  return (
    <motion.span
      style={
        reduced ? undefined : { opacity, filter: blur, willChange: "opacity" }
      }
      className={cn("mr-[0.25em] inline-block", accent && "text-[#cc9166] italic")}
    >
      {word}
    </motion.span>
  );
}

/** Counts to `value` the first time the number scrolls into view. */
export function CountUp({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  className,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px" });
  const reduced = useReducedMotion();
  const [n, setN] = React.useState(reduced ? value : 0);

  React.useEffect(() => {
    if (!inView || reduced) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / 1400, 1);
      // outExpo
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setN(value * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, reduced, value]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {n.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

/** Hero copy that drifts up and dissolves as the page leaves. */
export function HeroDissolve({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const opacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  return (
    <motion.div
      ref={ref}
      className={className}
      style={reduced ? undefined : { y, opacity }}
    >
      {children}
    </motion.div>
  );
}

/** Draws an SVG path as it enters view. */
export function DrawPath({
  d,
  className,
  stroke = "url(#gilded-stroke)",
  strokeWidth = 2,
  duration = 1.8,
}: {
  d: string;
  className?: string;
  stroke?: string;
  strokeWidth?: number;
  duration?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.path
      className={className}
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={reduced ? undefined : { pathLength: 0, opacity: 0 }}
      whileInView={reduced ? undefined : { pathLength: 1, opacity: 1 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration, ease: EASE }}
    />
  );
}

/** Reports scroll-driven active index over `count` steps within a tall block. */
export function useScrollSteps(
  ref: React.RefObject<HTMLElement | null>,
  count: number,
) {
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const [active, setActive] = React.useState(0);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const next = Math.min(count - 1, Math.max(0, Math.floor(v * count)));
    setActive(next);
  });

  return { active, scrollYProgress };
}
