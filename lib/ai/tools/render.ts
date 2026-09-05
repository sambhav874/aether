import { z } from "zod";
import { ok, type ToolResult } from "./shared";

// The agent emits a spec; the client draws it with lightweight-charts /
// recharts (both already in package.json) — see PLAN_AI_COPILOT.md §2.1
// "Rendering". Numbers reach the user through a renderer, not generated
// prose, closing the last transcription gap between a tool result and what
// the user actually reads. No I/O here: these two are pure spec validators,
// the last stop before the client, not fetchers.

// x is string-only, not string|number: a union here becomes an `anyOf` in
// the tool's JSON schema, which is exactly the kind of ambiguity that gets
// smaller/faster tool-calling models (this app's default lanes) to emit
// malformed JSON for the field — seen live as a provider-level "Failed to
// parse tool call arguments as JSON" 400, not something repairToolCall or a
// retry can fix since the request itself gets rejected. Every consumer
// already treats x as a category (ToolChart's ScatterChart XAxis is
// type="category") — dates and labels both stringify fine, so nothing
//
// `points` used to have `data`/`values` aliases for model leniency. Dropped:
// they were the exact field a Groq generation malformed live (emitted an
// object where the schema said array), and having three same-shaped
// optional fields for one concept is the kind of ambiguity that invites
// exactly that guess. One field, one shape.
/** A point as a model may actually emit it: a bare number, or an object
 * using any of several plausible key names for its axes. Narrowed below
 * rather than trusted. */
type RawChartPoint = number | Record<string, unknown>;

const chartSeriesSchema = z.object({
  label: z.string().optional().default("Series"),
  name: z.string().optional(),
  points: z
    .array(z.any())
    .default([])
    .describe('Array of {x, y} points (or plain numbers, index-numbered) — the only field for series data. Never rename this to "data" or "values".'),
});

export const renderChartInputSchema = z
  .object({
    kind: z.enum(["line", "candle", "bar", "scatter"]).describe("Type of chart to render"),
    seriesId: z.string().optional().describe('Only for kind:"candle" — must be copied verbatim from a prior get_candles result. Never set this for line/bar/scatter; use spec.series[].points instead.'),
    title: z.string().optional().describe("Chart title"),
    xLabel: z.string().optional().describe("X-axis label"),
    yLabel: z.string().optional().describe("Y-axis label"),
    spec: z
      .object({
        title: z.string().optional(),
        xLabel: z.string().optional(),
        yLabel: z.string().optional(),
        series: z.array(chartSeriesSchema).default([]),
      })
      .optional()
      .default({ series: [] }),
    series: z.array(chartSeriesSchema).optional(),
  })
  .transform((input) => {
    const rawSeries = input.series && input.series.length > 0 ? input.series : (input.spec?.series ?? []);
    const title = input.spec?.title || input.title;
    const xLabel = input.spec?.xLabel || input.xLabel;
    const yLabel = input.spec?.yLabel || input.yLabel;

    const normalizedSeries = rawSeries.map((s, sIdx) => {
      const label = s.label || s.name || `Series ${sIdx + 1}`;
      const rawPoints = s.points ?? [];
      const points = rawPoints.map((p: RawChartPoint, pIdx: number) => {
        if (typeof p === "number") {
          return { x: String(pIdx + 1), y: p };
        }
        if (typeof p === "object" && p !== null) {
          const xVal = p.x ?? p.time ?? p.date ?? p.label ?? p.category ?? String(pIdx + 1);
          const yVal = typeof p.y === "number" ? p.y : typeof p.value === "number" ? p.value : typeof p.close === "number" ? p.close : typeof p.price === "number" ? p.price : null;
          return { x: String(xVal), y: yVal };
        }
        return { x: String(pIdx + 1), y: null };
      });
      return { label, points };
    });

    return {
      kind: input.kind,
      seriesId: input.seriesId,
      spec: {
        title,
        xLabel,
        yLabel,
        series: normalizedSeries,
      },
    };
  });
export type RenderChartRawInput = z.input<typeof renderChartInputSchema>;
export type RenderChartInput = z.infer<typeof renderChartInputSchema>;

export function renderChart(rawInput: RenderChartRawInput | RenderChartInput): ToolResult<RenderChartInput> {
  const input = renderChartInputSchema.parse(rawInput);
  if (input.kind === "candle" && !input.seriesId) {
    return { status: "unavailable", reason: "candle charts must reference a seriesId from get_candles, not inline points" };
  }
  if (input.kind !== "candle" && input.spec.series.every((s) => s.points.length === 0)) {
    const gotSeriesId = input.seriesId
      ? ` A seriesId was passed instead, but seriesId only resolves data for kind:"candle" — a "${input.kind}" chart can't use it. Ignore seriesId here and pass spec.series[].points inline instead.`
      : "";
    return {
      status: "unavailable",
      reason: `spec.series has no points — this tool doesn't fetch data itself; pass the actual values inline (e.g. from get_candles/compute_indicators/correlate/analyze_my_performance output).${gotSeriesId}`,
    };
  }
  // A non-empty points array with every y resolving to null is still
  // nothing to plot — seen live from a model passing [index, value] pairs
  // (e.g. [[0, 8542304600064], [1, 17.14]], meant as "metric 0, metric 1")
  // instead of {x, y} points. The parser above can't invent a y that was
  // never there, so it fills null; without this check that silently
  // "succeeds" into a chart with every bar/line at zero height and no
  // error anywhere.
  if (input.kind !== "candle" && input.spec.series.every((s) => s.points.every((p) => p.y === null))) {
    return {
      status: "unavailable",
      reason:
        'every point resolved to a null y value — points must be {x, y} objects (one point per category/date), not e.g. [index, value] pairs. Rebuild spec.series[].points as {x: "<category or date>", y: <number>} using the actual values from another tool\'s output.',
    };
  }
  // Bar/line charts get one Y axis per *series*, not per x-category — so
  // when two metrics of wildly different scale (e.g. market cap ~1e12 and
  // a P/E ratio ~17) land as two points *inside the same series* (entity
  // as series, metric as x — seen live), no axis trick can make both
  // readable: recharts has nothing to key a per-point scale off. Bail out
  // and point at render_table, which handles mixed units natively (each
  // column carries its own unit). Cross-series disparity (metric as
  // series, entity as x) is a different, fixable shape — ToolChart gives
  // that one its own right-hand axis — so this only checks *within* a
  // series.
  if (input.kind === "bar" || input.kind === "line") {
    const hasUnfixableSpread = input.spec.series.some((s) => {
      const magnitudes = s.points.map((p) => (typeof p.y === "number" ? Math.abs(p.y) : null)).filter((n): n is number => n !== null && n > 0);
      if (magnitudes.length < 2) return false;
      return Math.max(...magnitudes) / Math.min(...magnitudes) >= 15;
    });
    if (hasUnfixableSpread) {
      return {
        status: "unavailable",
        reason:
          "one series mixes values of wildly different scale (e.g. a market cap next to a P/E ratio) — no chart axis can show both meaningfully together. If comparing multiple differently-scaled metrics per entity, use render_table instead (each column gets its own unit); if you do want a chart, put ONE metric per series (entity as x-axis category) rather than multiple metrics as points within one series.",
      };
    }
  }
  return ok(input);
}

const tableColumnSchema = z.object({ key: z.string(), label: z.string(), unit: z.string().optional() });
const tableCellSchema = z.union([z.string(), z.number(), z.null()]);

// Rows used to be `z.record(z.string(), tableCellSchema)` — a column-keyed
// object with open-ended keys. That's fine JSON Schema in the abstract
// (`additionalProperties: {schema}`), but strict-mode tool calling (Groq,
// same as OpenAI's) can't express "keys come from columns, decided per
// call" and collapses it to `additionalProperties: false` — making every
// non-empty row a schema violation by construction, deterministically,
// regardless of what the model does. Seen live: "additionalProperties
// 'peRatio', 'symbol', 'marketCap' not allowed" on a completely
// well-formed row.
//
// First fix tried: `rows: array of {key, value}[]` entries — structurally
// safe (no open properties anywhere), but *behaviorally* worse: a
// column-keyed object is by far the most common shape for "one row of
// tabular JSON" in a model's training data, so it kept emitting that
// shape anyway despite the schema and description saying otherwise —
// seen live failing nearly every attempt with "expected array, but got
// object" at every row. Positional arrays (cell values only, in column
// order — closer to a CSV row / 2D array, no natural "should be an
// object" pull) fixed the compliance rate back down while keeping the
// same closed-schema safety.
export const renderTableInputSchema = z
  .object({
    columns: z.array(tableColumnSchema).min(1),
    rows: z.array(z.array(tableCellSchema)).describe("Each row is an array of cell values in the SAME ORDER as columns — row[i] is the value for columns[i]. Use null for a column with no value for this row."),
    caption: z.string().optional(),
  })
  .transform((input) => ({
    ...input,
    rows: input.rows.map((row) => Object.fromEntries(input.columns.map((c, i) => [c.key, row[i] ?? null]))),
  }));
export type RenderTableInput = z.infer<typeof renderTableInputSchema>;

export function renderTable(input: RenderTableInput): ToolResult<RenderTableInput> {
  return ok(input);
}
