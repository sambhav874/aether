import type { Market } from "@/db/schema";
import type { PositionRow } from "@/lib/positions/types";

export const MARKET_CURRENCY: Record<Market, "USD" | "INR"> = {
  forex: "USD",
  indian_options: "INR",
  indian_equity: "INR",
};

export type MoneyByCurrency = Partial<Record<"USD" | "INR", number>>;

export type PerformanceKpis = {
  totalTrades: number;
  winRate: number | null;
  avgRR: number | null;
  netPnl: MoneyByCurrency;
  maxDrawdown: MoneyByCurrency;
  /** Computed from R-multiples, not raw $ P&L — positions span both USD
   * (forex) and INR (Indian F&O/equity), and summing raw currency amounts
   * without a live FX rate would misstate risk-adjusted return. This makes
   * Sharpe dimensionless and safe to combine across markets. */
  sharpe: number | null;
};

function currencyOf(row: PositionRow) {
  return MARKET_CURRENCY[row.market];
}

export function computePerformanceKpis(rows: PositionRow[]): PerformanceKpis {
  const closed = rows.filter((p) => p.status === "closed");

  const winners = closed.filter((p) => (p.pnl ?? 0) > 0);
  const winRate = closed.length > 0 ? (winners.length / closed.length) * 100 : null;

  const rMultiples = closed.map((p) => p.rr).filter((rr): rr is number => rr !== null);
  const avgRR =
    rMultiples.length > 0 ? rMultiples.reduce((sum, r) => sum + r, 0) / rMultiples.length : null;

  let sharpe: number | null = null;
  if (rMultiples.length > 1) {
    const mean = rMultiples.reduce((sum, r) => sum + r, 0) / rMultiples.length;
    const variance =
      rMultiples.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (rMultiples.length - 1);
    const stddev = Math.sqrt(variance);
    sharpe = stddev > 0 ? mean / stddev : null;
  }

  const netPnl: MoneyByCurrency = {};
  for (const position of closed) {
    const currency = currencyOf(position);
    netPnl[currency] = (netPnl[currency] ?? 0) + (position.pnl ?? 0);
  }

  const maxDrawdown: MoneyByCurrency = {};
  for (const currency of ["USD", "INR"] as const) {
    const chronological = closed
      .filter((p) => currencyOf(p) === currency && p.closedAt)
      .sort((a, b) => a.closedAt!.getTime() - b.closedAt!.getTime());
    if (chronological.length === 0) continue;

    let cumulative = 0;
    let peak = 0;
    let drawdown = 0;
    for (const position of chronological) {
      cumulative += position.pnl ?? 0;
      peak = Math.max(peak, cumulative);
      drawdown = Math.max(drawdown, peak - cumulative);
    }
    maxDrawdown[currency] = drawdown;
  }

  return { totalTrades: closed.length, winRate, avgRR, netPnl, maxDrawdown, sharpe };
}

export type DailyPnlPoint = { date: string; pnl: number };

/** Per-day net P&L (not cumulative — for the calendar heatmap), split by
 * currency for the same reason computePerformanceKpis is. */
export function computeDailyPnlByCurrency(rows: PositionRow[]): Record<"USD" | "INR", DailyPnlPoint[]> {
  const result: Record<"USD" | "INR", DailyPnlPoint[]> = { USD: [], INR: [] };
  for (const currency of ["USD", "INR"] as const) {
    const byDay = new Map<string, number>();
    for (const position of rows) {
      if (position.status !== "closed" || !position.closedAt) continue;
      if (currencyOf(position) !== currency) continue;
      const key = position.closedAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + (position.pnl ?? 0));
    }
    result[currency] = Array.from(byDay.entries())
      .map(([date, pnl]) => ({ date, pnl }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  return result;
}

export type EquityPoint = { index: number; date: string; cumulative: number; r: number };
export type EquityCurve = {
  points: EquityPoint[];
  starting: number;
  current: number;
  peak: number;
  drawdown: number;
};

/** Trade-sequential cumulative P&L (and cumulative R, for the ₹/%/R toggle —
 * "%" is derived client-side from ₹ against starting capital, since capital
 * lives in trading_settings/strategy_risk_settings, not here). Keyed by
 * currency, same split as the rest of this module. */
export function computeEquityCurve(rows: PositionRow[]): Record<"USD" | "INR", EquityCurve> {
  const result = {} as Record<"USD" | "INR", EquityCurve>;
  for (const currency of ["USD", "INR"] as const) {
    const chronological = rows
      .filter((p) => p.status === "closed" && p.closedAt && currencyOf(p) === currency)
      .sort((a, b) => a.closedAt!.getTime() - b.closedAt!.getTime());

    let cumulative = 0;
    let cumulativeR = 0;
    let peak = 0;
    let drawdown = 0;
    const points: EquityPoint[] = [];
    chronological.forEach((p, i) => {
      cumulative += p.pnl ?? 0;
      cumulativeR += p.rr ?? 0;
      peak = Math.max(peak, cumulative);
      drawdown = Math.max(drawdown, peak - cumulative);
      points.push({ index: i + 1, date: p.closedAt!.toISOString().slice(0, 10), cumulative, r: cumulativeR });
    });

    result[currency] = { points, starting: 0, current: cumulative, peak, drawdown };
  }
  return result;
}

export type PnlBucket = { label: string; count: number; isPositive: boolean };

/** Per-trade P&L histogram, split into `bucketCount` equal-width buckets
 * spanning the full loss→profit range actually observed. */
export function computePnlDistribution(rows: PositionRow[], bucketCount = 10): Record<"USD" | "INR", PnlBucket[]> {
  const result = {} as Record<"USD" | "INR", PnlBucket[]>;
  for (const currency of ["USD", "INR"] as const) {
    const values = rows.filter((p) => p.status === "closed" && currencyOf(p) === currency).map((p) => p.pnl ?? 0);
    if (values.length === 0) {
      result[currency] = [];
      continue;
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) {
      result[currency] = [{ label: min.toFixed(0), count: values.length, isPositive: min >= 0 }];
      continue;
    }
    const width = (max - min) / bucketCount;
    const buckets = Array.from({ length: bucketCount }, (_, i) => {
      const lo = min + i * width;
      const hi = i === bucketCount - 1 ? max : lo + width;
      return { lo, hi, count: 0 };
    });
    for (const v of values) {
      const idx = Math.min(bucketCount - 1, Math.floor((v - min) / width));
      buckets[idx].count += 1;
    }
    result[currency] = buckets.map((b) => ({
      label: `${b.lo.toFixed(0)}…${b.hi.toFixed(0)}`,
      count: b.count,
      isPositive: b.lo + b.hi >= 0,
    }));
  }
  return result;
}

export type StreakSummary = {
  currentStreak: { type: "win" | "loss" | null; count: number };
  longestWinStreak: number;
  longestLossStreak: number;
  avgWinStreak: number;
  avgLossStreak: number;
  recent: { symbol: string; pnl: number; win: boolean; closedAt: Date }[];
};

export function computeStreaks(rows: PositionRow[]): Record<"USD" | "INR", StreakSummary> {
  const result = {} as Record<"USD" | "INR", StreakSummary>;
  for (const currency of ["USD", "INR"] as const) {
    const chronological = rows
      .filter((p) => p.status === "closed" && p.closedAt && currencyOf(p) === currency)
      .sort((a, b) => a.closedAt!.getTime() - b.closedAt!.getTime());

    const winStreaks: number[] = [];
    const lossStreaks: number[] = [];
    let runType: "win" | "loss" | null = null;
    let runLength = 0;
    let longestWin = 0;
    let longestLoss = 0;

    function flushRun() {
      if (runType === "win" && runLength > 0) winStreaks.push(runLength);
      if (runType === "loss" && runLength > 0) lossStreaks.push(runLength);
    }

    for (const p of chronological) {
      const isWin = (p.pnl ?? 0) > 0;
      const type: "win" | "loss" = isWin ? "win" : "loss";
      if (type === runType) {
        runLength += 1;
      } else {
        flushRun();
        runType = type;
        runLength = 1;
      }
      longestWin = Math.max(longestWin, type === "win" ? runLength : longestWin);
      longestLoss = Math.max(longestLoss, type === "loss" ? runLength : longestLoss);
    }
    flushRun();

    const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((s, n) => s + n, 0) / arr.length : 0);

    result[currency] = {
      currentStreak: { type: runType, count: runLength },
      longestWinStreak: longestWin,
      longestLossStreak: longestLoss,
      avgWinStreak: avg(winStreaks),
      avgLossStreak: avg(lossStreaks),
      recent: chronological
        .slice(-10)
        .reverse()
        .map((p) => ({ symbol: p.symbol, pnl: p.pnl ?? 0, win: (p.pnl ?? 0) > 0, closedAt: p.closedAt! })),
    };
  }
  return result;
}

export type SymbolPerformanceRow = {
  symbol: string;
  trades: number;
  winRate: number;
  net: number;
  avgR: number | null;
};

export function computeSymbolPerformance(rows: PositionRow[]): Record<"USD" | "INR", SymbolPerformanceRow[]> {
  const result = {} as Record<"USD" | "INR", SymbolPerformanceRow[]>;
  for (const currency of ["USD", "INR"] as const) {
    const closed = rows.filter((p) => p.status === "closed" && currencyOf(p) === currency);
    const bySymbol = new Map<string, PositionRow[]>();
    for (const p of closed) {
      const list = bySymbol.get(p.symbol) ?? [];
      list.push(p);
      bySymbol.set(p.symbol, list);
    }
    result[currency] = Array.from(bySymbol.entries())
      .map(([symbol, trades]) => {
        const wins = trades.filter((p) => (p.pnl ?? 0) > 0).length;
        const net = trades.reduce((s, p) => s + (p.pnl ?? 0), 0);
        const rValues = trades.map((p) => p.rr).filter((r): r is number => r !== null);
        return {
          symbol,
          trades: trades.length,
          winRate: (wins / trades.length) * 100,
          net,
          avgR: rValues.length > 0 ? rValues.reduce((s, r) => s + r, 0) / rValues.length : null,
        };
      })
      .sort((a, b) => b.net - a.net);
  }
  return result;
}

export type PerformanceInsight = {
  severity: "info" | "warning";
  title: string;
  body: string;
};

/**
 * Rule-based diagnostics only — every insight cites the trades it came
 * from. No LLM narration, no invented numbers: if a rule's minimum sample
 * size isn't met, it's simply skipped rather than guessed at.
 */
export function generateInsights(rows: PositionRow[]): Record<"USD" | "INR", PerformanceInsight[]> {
  const result = {} as Record<"USD" | "INR", PerformanceInsight[]>;
  for (const currency of ["USD", "INR"] as const) {
    const closed = rows
      .filter((p) => p.status === "closed" && p.closedAt && currencyOf(p) === currency)
      .sort((a, b) => a.closedAt!.getTime() - b.closedAt!.getTime());
    const insights: PerformanceInsight[] = [];

    if (closed.length >= 5) {
      const bySide = { long: closed.filter((p) => p.side === "long"), short: closed.filter((p) => p.side === "short") };
      for (const side of ["long", "short"] as const) {
        const trades = bySide[side];
        if (trades.length < 3) continue;
        const wins = trades.filter((p) => (p.pnl ?? 0) > 0).length;
        const rate = (wins / trades.length) * 100;
        if (rate < 35) {
          insights.push({
            severity: "warning",
            title: `${side === "long" ? "Long" : "Short"} win rate is low`,
            body: `${wins}/${trades.length} ${side} trades won (${rate.toFixed(0)}%) in this window.`,
          });
        }
      }
    }

    if (closed.length >= 10) {
      const byDay = new Map<string, number>();
      for (const p of closed) {
        const key = p.closedAt!.toISOString().slice(0, 10);
        byDay.set(key, (byDay.get(key) ?? 0) + 1);
      }
      const busiest = Array.from(byDay.entries()).sort((a, b) => b[1] - a[1])[0];
      const avgPerDay = closed.length / byDay.size;
      if (busiest[1] > avgPerDay * 3 && busiest[1] >= 5) {
        insights.push({
          severity: "info",
          title: "Trading concentrated on one day",
          body: `${busiest[1]} of ${closed.length} trades happened on ${busiest[0]} — ${(avgPerDay).toFixed(1)} is the average per active day.`,
        });
      }
    }

    if (closed.length >= 3) {
      let lossFollowedByLoss = 0;
      let lossFollowedByAny = 0;
      for (let i = 0; i < closed.length - 1; i++) {
        if ((closed[i].pnl ?? 0) < 0) {
          lossFollowedByAny += 1;
          if ((closed[i + 1].pnl ?? 0) < 0) lossFollowedByLoss += 1;
        }
      }
      if (lossFollowedByAny >= 3 && lossFollowedByLoss / lossFollowedByAny > 0.65) {
        insights.push({
          severity: "warning",
          title: "Losses tend to cluster",
          body: `${lossFollowedByLoss}/${lossFollowedByAny} losing trades were immediately followed by another loss.`,
        });
      }
    }

    result[currency] = insights;
  }
  return result;
}

export function formatMoneyByCurrency(amounts: MoneyByCurrency): string {
  const parts = (Object.entries(amounts) as [("USD" | "INR"), number][])
    .filter(([, value]) => value !== undefined)
    .map(([currency, value]) => {
      const symbol = currency === "INR" ? "₹" : "$";
      const sign = value < 0 ? "-" : "";
      return `${sign}${symbol}${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    });
  return parts.length > 0 ? parts.join(" · ") : "—";
}
