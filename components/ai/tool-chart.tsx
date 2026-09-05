"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { createChart, CandlestickSeries, type IChartApi, type ISeriesApi } from "lightweight-charts";
import type { RenderChartInput } from "@/lib/ai/tools/render";
import type { ChartCandle } from "@/lib/market/india-chart";

// Reads the *output* of a render_chart tool call (a validated RenderChartInput
// spec — see lib/ai/tools/render.ts) and actually draws it. The tool itself
// only validates the spec; this is the other half of "the agent emits a
// spec, the client draws it" (PLAN_AI_COPILOT.md §2.1 "Rendering") — without
// this component the spec had nowhere to go, which is why a model would
// resort to hallucinating a markdown `![...]` image placeholder instead
// (there being no other visible way to "show a chart").
//
// Scope: line/bar/scatter render from the spec's inline points. `kind:
// "candle"` references a seriesId from a prior get_candles call rather than
// carrying OHLC points at all (the model only ever sees a downsampled
// summary — see candles.ts) — CandleChart below re-fetches the full series
// via /api/ai/candles?seriesId=... and draws it with lightweight-charts.

const COLORS = ["var(--chart-1, #6366f1)", "var(--chart-2, #22c55e)", "var(--chart-3, #f59e0b)", "var(--chart-4, #ec4899)"];

const COMPACT_NUMBER = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
function formatTick(value: number | string): string {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? COMPACT_NUMBER.format(n) : String(value);
}

/**
 * Bar/line charts merge every series onto one shared Y axis by default,
 * which makes a small-magnitude series (e.g. a PE ratio ~17) an invisible
 * sliver next to a large one (e.g. market cap ~1e12) on the same scale.
 * When a series' peak magnitude is off by an order of magnitude or more
 * from the largest series, give it its own right-hand axis instead of
 * silently flattening it to zero height.
 */
function assignAxes(series: RenderChartInput["spec"]["series"]): { needsDualAxis: boolean; axisOf: (label: string) => "left" | "right" } {
  const peaks = series.map((s) => Math.max(0, ...s.points.map((p) => (typeof p.y === "number" ? Math.abs(p.y) : 0))));
  const maxPeak = Math.max(0, ...peaks);
  const rightLabels = new Set(series.filter((s, i) => maxPeak > 0 && peaks[i] > 0 && maxPeak / peaks[i] >= 15).map((s) => s.label));
  return { needsDualAxis: rightLabels.size > 0 && rightLabels.size < series.length, axisOf: (label) => (rightLabels.has(label) ? "right" : "left") };
}

type MergedPoint = { x: string | number } & Record<string, number | null | string>;

function mergeSeries(series: RenderChartInput["spec"]["series"]): MergedPoint[] {
  const byX = new Map<string | number, MergedPoint>();
  for (const s of series) {
    for (const point of s.points) {
      const row = byX.get(point.x) ?? { x: point.x };
      row[s.label] = point.y;
      byX.set(point.x, row);
    }
  }
  return Array.from(byX.values());
}

type CandleFetchState =
  | { status: "loading" }
  | { status: "error"; reason: string }
  | { status: "ok"; candles: ChartCandle[] };

/** globals.css defines these tokens as oklch()/lab(). lightweight-charts
 * parses color strings with its own regex-based parser (rgb/rgba/hex/hsl
 * only) rather than the browser's, so handing it "lab(...)" text fails —
 * even though the DOM itself now happily keeps colors in their authored
 * color space instead of downgrading to rgb() on readback (Chrome 111+),
 * so reading getComputedStyle().color no longer helps either. The one
 * component guaranteed to resolve any CSS color to concrete sRGB bytes is
 * <canvas>'s own fillStyle parser — paint one pixel and read it back. */
function resolveToRgb(value: string, fallback: string): string {
  if (!value) return fallback;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return fallback;
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
  } catch {
    return fallback;
  }
}

/** Reads --border/--muted-foreground off the document at mount time and
 * resolves them to colors the canvas 2D context can use. Read once on
 * mount; a theme toggle mid-session won't repaint until the chart
 * remounts, which is an acceptable gap for a first cut. */
function readThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    text: resolveToRgb(styles.getPropertyValue("--muted-foreground").trim(), "#888"),
    border: resolveToRgb(styles.getPropertyValue("--border").trim(), "#333"),
  };
}

function CandleChart({ seriesId, title }: { seriesId: string; title?: string }) {
  const [state, setState] = React.useState<CandleFetchState>({ status: "loading" });
  // Reset to loading when the series changes, during render rather than in
  // the effect below — setting it synchronously inside an effect makes React
  // paint the previous series' candles once before the reset lands.
  const [loadedFor, setLoadedFor] = React.useState(seriesId);
  if (loadedFor !== seriesId) {
    setLoadedFor(seriesId);
    setState({ status: "loading" });
  }
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/ai/candles?seriesId=${encodeURIComponent(seriesId)}`)
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: "error", reason: body.error ?? `request failed (${res.status})` });
          return;
        }
        setState({ status: "ok", candles: body.candles });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ status: "error", reason: error instanceof Error ? error.message : "network error" });
      });
    return () => {
      cancelled = true;
    };
  }, [seriesId]);

  React.useEffect(() => {
    if (state.status !== "ok" || !containerRef.current) return;

    const { text, border } = readThemeColors();
    const chart = createChart(containerRef.current, {
      layout: { background: { color: "transparent" }, textColor: text },
      grid: { vertLines: { color: border }, horzLines: { color: border } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border },
      autoSize: true,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    series.setData(state.candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
    chart.timeScale().fitContent();
    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [state]);

  if (state.status === "loading") {
    return <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">Loading candles…</div>;
  }
  if (state.status === "error") {
    return (
      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        Candle chart unavailable ({title ?? "untitled"}) — {state.reason}. Ask for the price history as a table instead.
      </div>
    );
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border/80 bg-card/90 p-4 shadow-xs backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between border-b border-border/50 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-mono text-xs font-medium text-foreground">{title ?? "Price History"}</span>
        </div>
        <span className="rounded-full bg-muted/80 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Candlestick (OHLC)
        </span>
      </div>
      <div ref={containerRef} className="h-72 w-full" />
    </div>
  );
}

export function ToolChart({ input }: { input: RenderChartInput }) {
  const { kind, spec } = input;

  if (kind === "candle") {
    if (!input.seriesId) return null; // renderChart's own validation already rejects this shape server-side
    return <CandleChart seriesId={input.seriesId} title={spec.title} />;
  }

  if (spec.series.length === 0 || spec.series.every((s) => s.points.length === 0)) {
    return null;
  }

  const data = mergeSeries(spec.series);
  const { needsDualAxis, axisOf } = assignAxes(spec.series);

  const kindLabel = kind === "bar" ? "Bar Chart" : kind === "scatter" ? "Scatter Plot" : "Line Chart";

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border/80 bg-card/90 p-4 shadow-xs backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between border-b border-border/50 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-[#c8102e]" />
          <span className="font-mono text-xs font-medium text-foreground">{spec.title ?? "Telemetry Visualizer"}</span>
        </div>
        <span className="rounded-full bg-muted/80 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {kindLabel}
        </span>
      </div>
      <div className="h-60 w-full pt-1">
        <ResponsiveContainer width="100%" height="100%">
          {kind === "bar" ? (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
              <XAxis dataKey="x" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} label={spec.xLabel ? { value: spec.xLabel, position: "insideBottom", offset: -2, fontSize: 11 } : undefined} />
              <YAxis yAxisId="left" tickFormatter={formatTick} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} label={spec.yLabel ? { value: spec.yLabel, angle: -90, position: "insideLeft", fontSize: 11 } : undefined} />
              {needsDualAxis && <YAxis yAxisId="right" orientation="right" tickFormatter={formatTick} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} />}
              <Tooltip contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)", borderRadius: "8px", fontSize: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
              {spec.series.map((s, i) => (
                <Bar key={s.label} yAxisId={needsDualAxis ? axisOf(s.label) : "left"} dataKey={s.label} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          ) : kind === "scatter" ? (
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
              <XAxis
                dataKey="x"
                type="number"
                domain={["auto", "auto"]}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                label={spec.xLabel ? { value: spec.xLabel, position: "insideBottom", offset: -2, fontSize: 11 } : undefined}
              />
              <YAxis
                dataKey="y"
                type="number"
                domain={["auto", "auto"]}
                tickFormatter={formatTick}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={48}
                label={spec.yLabel ? { value: spec.yLabel, angle: -90, position: "insideLeft", fontSize: 11 } : undefined}
              />
              <Tooltip contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)", borderRadius: "8px", fontSize: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
              {spec.series.map((s, i) => {
                const scatterPoints = s.points.map((p) => ({
                  x: isNaN(Number(p.x)) ? p.x : Number(p.x),
                  y: p.y !== null ? Number(p.y) : null,
                }));
                return <Scatter key={s.label} name={s.label} data={scatterPoints} fill={COLORS[i % COLORS.length]} />;
              })}
            </ScatterChart>
          ) : (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
              <XAxis dataKey="x" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis yAxisId="left" tickFormatter={formatTick} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} domain={["auto", "auto"]} />
              {needsDualAxis && <YAxis yAxisId="right" orientation="right" tickFormatter={formatTick} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} domain={["auto", "auto"]} />}
              <Tooltip contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)", borderRadius: "8px", fontSize: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
              {spec.series.map((s, i) => (
                <Line key={s.label} yAxisId={needsDualAxis ? axisOf(s.label) : "left"} type="monotone" dataKey={s.label} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2.5} connectNulls />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      {spec.series.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border/40 pt-2 font-mono text-[11px] text-muted-foreground">
          {spec.series.map((s, i) => (
            <span key={s.label} className="flex items-center gap-1.5 rounded-sm bg-muted/40 px-2 py-0.5">
              <span className="size-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="font-medium text-foreground">{s.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
