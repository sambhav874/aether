"use client";

import * as React from "react";
import { animate } from "animejs";
import { useAppearance } from "@/components/providers/appearance-provider";

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

    if (motionPref === "reduced") {
      el.textContent = formatRef.current(value);
      prevValue.current = value;
      return;
    }

    const obj = { v: prevValue.current };
    const anim = animate(obj, {
      v: value,
      duration: 700,
      ease: "outExpo",
      onUpdate: () => {
        el.textContent = formatRef.current(obj.v);
      },
    });
    prevValue.current = value;
    return () => {
      anim.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, motionPref]);

  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}
