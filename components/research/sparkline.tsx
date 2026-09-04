"use client";

import * as React from "react";
import { fetchCompanyChartAction } from "@/lib/research/company-actions";

export function Sparkline({ symbol, width = 100, height = 36 }: { symbol: string; width?: number; height?: number }) {
  const [closes, setCloses] = React.useState<number[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setCloses(null);
    });
    void fetchCompanyChartAction(symbol).then((r) => {
      if (cancelled) return;
      setCloses(r.status === "ok" ? r.candles.map((c) => c.close) : []);
    });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (!closes || closes.length < 2) return null;

  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const positive = closes.at(-1)! >= closes[0];
  const points = closes
    .map((c, i) => {
      const x = (i / (closes.length - 1)) * width;
      const y = height - ((c - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={positive ? "#22c55e" : "#ef4444"}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
