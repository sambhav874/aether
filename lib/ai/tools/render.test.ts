import { describe, it, expect } from "vitest";
import { renderChart, renderChartInputSchema, renderTable, renderTableInputSchema } from "./render";

describe("renderChart", () => {
  it("rejects a candle chart with no seriesId — inline points would reopen the token-budget problem get_candles downsampling solves", () => {
    const result = renderChart({ kind: "candle", spec: { series: [] } });
    expect(result.status).toBe("unavailable");
  });

  it("accepts a candle chart with a seriesId", () => {
    const result = renderChart({ kind: "candle", seriesId: "abc123", spec: { series: [] } });
    expect(result.status).toBe("ok");
  });

  it("accepts a line chart with inline points, no seriesId required", () => {
    const result = renderChart({
      kind: "line",
      spec: { title: "PnL", series: [{ label: "Cumulative", points: [{ x: "2026-01-01", y: 100 }] }] },
    });
    expect(result.status).toBe("ok");
  });

  it("parses tool input when series[0] is missing points (e.g. for candle charts)", () => {
    const parsed = renderChartInputSchema.parse({
      kind: "candle",
      seriesId: "cand_123",
      spec: { series: [{ label: "NIFTY" }] },
    });
    expect(parsed.seriesId).toBe("cand_123");
    expect(parsed.spec.series[0].points).toEqual([]);
    const result = renderChart(parsed);
    expect(result.status).toBe("ok");
  });

  it("parses tool input when points are raw number arrays and title is at root", () => {
    const parsed = renderChartInputSchema.parse({
      kind: "line",
      title: "HDFC vs ICICI",
      xLabel: "Day",
      yLabel: "Price",
      spec: {
        series: [
          { label: "HDFCBANK", points: [1600.5, 1610.2, 1595.0] },
          { label: "ICICIBANK", points: [1200.0, 1215.5, 1205.0] },
        ],
      },
    });
    expect(parsed.spec.title).toBe("HDFC vs ICICI");
    expect(parsed.spec.series[0].points).toEqual([
      { x: "1", y: 1600.5 },
      { x: "2", y: 1610.2 },
      { x: "3", y: 1595.0 },
    ]);
    const result = renderChart(parsed);
    expect(result.status).toBe("ok");
  });

  // Seen live: a model passed [index, value] pairs (e.g. [[0, 8.5e12], [1,
  // 17.14]]) instead of {x, y} points — every y resolves to null, and
  // without this guard the chart "succeeds" with nothing plottable.
  it("rejects a chart whose points all resolve to a null y", () => {
    const parsed = renderChartInputSchema.parse({
      kind: "bar",
      spec: {
        series: [
          { label: "TCS", points: [[0, 8542304600064], [1, 17.139746]] },
          { label: "INFY", points: [[0, 4735404343296], [1, 15.1215725]] },
        ],
      },
    });
    const result = renderChart(parsed);
    expect(result.status).toBe("unavailable");
  });

  // Seen live: entity-as-series, metric-as-x — each series mixes a market
  // cap (~1e12) and a P/E ratio (~17) as its own two points. Recharts
  // assigns one Y axis per series, so no axis config can make both
  // readable; this shape must be rejected rather than silently rendered
  // with one metric invisible.
  it("rejects a bar chart whose series mixes metrics of wildly different scale", () => {
    const parsed = renderChartInputSchema.parse({
      kind: "bar",
      spec: {
        series: [
          { label: "TCS.NS", points: [{ x: "marketCap", y: 8542304600064 }, { x: "peRatio", y: 17.139746 }] },
          { label: "INFY.NS", points: [{ x: "marketCap", y: 4735404343296 }, { x: "peRatio", y: 15.1215725 }] },
        ],
      },
    });
    const result = renderChart(parsed);
    expect(result.status).toBe("unavailable");
  });

  it("accepts a bar chart where each series is one metric across entities (no within-series spread)", () => {
    const parsed = renderChartInputSchema.parse({
      kind: "bar",
      spec: {
        series: [{ label: "Market Cap", points: [{ x: "TCS", y: 8542304600064 }, { x: "INFY", y: 4735404343296 }] }],
      },
    });
    const result = renderChart(parsed);
    expect(result.status).toBe("ok");
  });
});

describe("renderTable", () => {
  it("accepts column-keyed rows (the post-transform shape)", () => {
    const result = renderTable({
      columns: [{ key: "symbol", label: "Symbol" }, { key: "pe", label: "P/E", unit: "x" }],
      rows: [{ symbol: "TCS", pe: 28.4 }, { symbol: "INFY", pe: null }],
    });
    expect(result.status).toBe("ok");
  });

  // Wire format is positional — rows: cell[][], row[i] maps to
  // columns[i] — not a column-keyed object. z.record() (the original
  // shape) compiles to open `additionalProperties`, which strict-mode
  // tool calling (Groq) flattens to `additionalProperties: false`,
  // rejecting every populated row unconditionally regardless of what the
  // model sends. A {key,value}[] per-cell shape was tried next and *was*
  // schema-safe, but a column-keyed object is such a dominant pattern for
  // "one row of tabular JSON" in training data that the model kept
  // emitting that shape anyway — nearly every attempt failed the same
  // way. Positional arrays (closer to a CSV row) fixed compliance while
  // keeping the same closed-schema safety.
  it("parses the positional cell[][] wire format into column-keyed rows", () => {
    const parsed = renderTableInputSchema.parse({
      columns: [{ key: "symbol", label: "Symbol" }, { key: "pe", label: "P/E", unit: "x" }],
      rows: [
        ["TCS", 28.4],
        ["INFY"],
      ],
    });
    expect(parsed.rows).toEqual([{ symbol: "TCS", pe: 28.4 }, { symbol: "INFY", pe: null }]);
    expect(renderTable(parsed).status).toBe("ok");
  });
});
