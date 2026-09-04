"use client";

import * as React from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

const MERIDIANS = 14;
const LATITUDES = 7;

/**
 * A wireframe gilded sphere built from real CSS 3D transforms — meridian and
 * latitude rings living in a shared preserve-3d space. It spins on its own and
 * tips/scales with scroll position.
 */
export function AetherOrb({ className }: { className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const rawTilt = useTransform(scrollYProgress, [0, 1], [26, -26]);
  const rotateX = useSpring(rawTilt, { stiffness: 90, damping: 24 });
  const rawScale = useTransform(scrollYProgress, [0, 0.45, 1], [0.82, 1, 0.88]);
  const scale = useSpring(rawScale, { stiffness: 90, damping: 26 });
  const glow = useTransform(scrollYProgress, [0, 0.45, 1], [0.15, 0.4, 0.18]);

  return (
    <div
      ref={ref}
      className={cn("relative isolate aspect-square w-full", className)}
      style={{ perspective: "1200px" }}
    >
      {/* halo */}
      <motion.div
        aria-hidden
        style={reduced ? { opacity: 0.3 } : { opacity: glow }}
        className="pointer-events-none absolute inset-[12%] -z-10 rounded-full bg-[#cc9166] blur-[90px]"
      />

      <motion.div
        className="size-full"
        style={{
          transformStyle: "preserve-3d",
          ...(reduced ? { transform: "rotateX(18deg)" } : { rotateX, scale }),
        }}
      >
        <motion.div
          className="size-full"
          style={{ transformStyle: "preserve-3d" }}
          animate={reduced ? undefined : { rotateY: 360 }}
          transition={{ duration: 44, ease: "linear", repeat: Infinity }}
        >
          {/* meridians */}
          {Array.from({ length: MERIDIANS }).map((_, i) => (
            <div
              key={`m-${i}`}
              className="absolute inset-0 rounded-full border"
              style={{
                transform: `rotateY(${(180 / MERIDIANS) * i}deg)`,
                borderColor:
                  i % 4 === 0 ? "rgba(255,240,204,0.42)" : "rgba(204,145,102,0.22)",
                borderWidth: i % 4 === 0 ? 1.2 : 1,
              }}
            />
          ))}

          {/* latitudes */}
          {Array.from({ length: LATITUDES }).map((_, i) => {
            const t = (i + 1) / (LATITUDES + 1); // 0..1 down the sphere
            const angle = (t - 0.5) * Math.PI; // -π/2..π/2
            const radius = Math.cos(angle); // relative ring radius
            const offset = Math.sin(angle) * 50; // % of half-height
            return (
              <div
                key={`l-${i}`}
                className="absolute rounded-full border border-[rgba(174,147,87,0.3)]"
                style={{
                  inset: `${(1 - radius) * 50}%`,
                  transform: `rotateX(90deg) translateZ(${offset}%)`,
                }}
              />
            );
          })}

          {/* orbiting node ring */}
          <div
            className="absolute inset-[-6%] rounded-full border border-dashed border-[rgba(255,240,204,0.28)]"
            style={{ transform: "rotateX(74deg) rotateZ(18deg)" }}
          />
        </motion.div>
      </motion.div>

      {/* core */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 size-[16%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff0cc,#cc9166_55%,#6b4a2c_100%)] shadow-[0_0_60px_18px_rgba(204,145,102,0.25)]"
      />
    </div>
  );
}
