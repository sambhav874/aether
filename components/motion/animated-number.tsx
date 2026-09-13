"use client";

import * as React from "react";
import { useAppearance } from "@/components/providers/appearance-provider";

/** Matches the easing this used from anime.js, so the motion is unchanged. */
function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/**
 * Counts a number up to its new value on change.
 *
 * Hand-rolled on requestAnimationFrame rather than pulling in an animation
 * library. This was the only thing anime.js was used for anywhere in the app,
 * and a tweened counter does not justify a dependency shipped to every client.
 */
export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const prevValue = React.useRef(0);
  const formatRef = React.useRef(format);
  const { motion: motionPref } = useAppearance();

  React.useEffect(() => {
    formatRef.current = format;
  }, [format]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const from = prevValue.current;
    prevValue.current = value;

    // Respects the user's reduced-motion preference: land on the value with
    // no tween at all rather than shortening it.
    if (motionPref === "reduced" || from === value) {
      el.textContent = formatRef.current(value);
      return;
    }

    const DURATION = 700;
    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / DURATION, 1);
      el.textContent = formatRef.current(from + (value - from) * easeOutExpo(progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, motionPref]);

  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}
