"use client";

import * as React from "react";
import { createChart, CandlestickSeries, ColorType, type IChartApi } from "lightweight-charts";
import { useTheme } from "next-themes";
import { fetchIndiaChartAction } from "@/lib/market/actions";
import type { CandleChartResult } from "@/lib/market/india-chart";

export function IndiaChart({
  symbol,
  kind,
  height = 520,
}: {
  symbol: string;
  kind: "equity" | "index";
  height?: number;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const { resolvedTheme } = useTheme();
  const [result, setResult] = React.useState<CandleChartResult | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setResult(null);
    });
    void fetchIndiaChartAction(symbol, kind).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, kind]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || !result || result.status !== "ok") return;

    const dark = resolvedTheme === "dark";
    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: dark ? "#a1a1aa" : "#52525b",
      },
      grid: {
        vertLines: { color: dark ? "#27272a" : "#e4e4e7" },
        horzLines: { color: dark ? "#27272a" : "#e4e4e7" },
      },
      timeScale: { borderColor: dark ? "#3f3f46" : "#d4d4d8" },
      rightPriceScale: { borderColor: dark ? "#3f3f46" : "#d4d4d8" },
    });
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    series.setData(result.candles);
    chart.timeScale().fitContent();

    const onResize = () => chart.applyOptions({ width: container.clientWidth });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [result, resolvedTheme, height]);

  return (
    <div className="overflow-hidden rounded-lg border" style={{ height }}>
      {!result ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>
      ) : result.status === "unavailable" ? (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-medium">Chart unavailable</p>
          <p className="text-xs text-muted-foreground">{result.reason}</p>
        </div>
      ) : (
        <div ref={containerRef} className="h-full w-full" />
      )}
    </div>
  );
}
