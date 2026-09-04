import type { ChartCandle } from "@/lib/market/india-chart";

// Pure math over candle series — no fetching, no caching, no LLM. This is
// the enforcement mechanism for PLAN_AI_COPILOT.md invariant #2 ("the model
// never does arithmetic"): every ratio/indicator/comparison the agent can
// state is computed here in TypeScript, not inferred from raw numbers by
// the model. Every function returns `null` on insufficient data rather than
// throwing — a partial answer beats a crashed tool call.

export const TRADING_DAYS_PER_YEAR = 252;

function closesOf(candles: ChartCandle[]): number[] {
  return candles.map((c) => c.close);
}

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const window = values.slice(values.length - period);
  return window.reduce((sum, v) => sum + v, 0) / period;
}

export function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
  }
  return prev;
}

/** Wilder's RSI — the standard 14-period definition, not the naive SMA-of-gains variant. */
export function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) avgGain += change;
    else avgLoss += -change;
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = change >= 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Wilder's ATR — true range smoothed the same way as rsi()'s gain/loss average. */
export function atr(candles: ChartCandle[], period = 14): number | null {
  if (candles.length < period + 1) return null;

  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose = candles[i - 1].close;
    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }

  let value = trueRanges.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    value = (value * (period - 1) + trueRanges[i]) / period;
  }
  return value;
}

/** Annualized realized volatility (%) from daily close-to-close returns over the trailing `period` days. */
export function realizedVolatility(candles: ChartCandle[], period = 20): number | null {
  if (candles.length < period + 1) return null;
  const window = candles.slice(candles.length - period - 1);
  const returns: number[] = [];
  for (let i = 1; i < window.length; i++) {
    returns.push(Math.log(window[i].close / window[i - 1].close));
  }
  const mean = returns.reduce((sum, v) => sum + v, 0) / returns.length;
  const variance = returns.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (returns.length - 1 || 1);
  const dailyStdDev = Math.sqrt(variance);
  return dailyStdDev * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
}

/** Where the last close sits within the provided candle set's own high/low range, as a 0-100 %. Caller supplies a ~1y window for a true 52-week read. */
export function positionInRange(candles: ChartCandle[]): number | null {
  if (candles.length === 0) return null;
  const last = candles[candles.length - 1].close;
  const high = Math.max(...candles.map((c) => c.high));
  const low = Math.min(...candles.map((c) => c.low));
  if (high === low) return 50;
  return ((last - low) / (high - low)) * 100;
}

/** Current drawdown (%) from the peak close within the provided window — 0 at a new high, negative below it. */
export function drawdown(candles: ChartCandle[]): number | null {
  if (candles.length === 0) return null;
  const closes = closesOf(candles);
  const peak = Math.max(...closes);
  const last = closes[closes.length - 1];
  if (peak === 0) return null;
  return ((last - peak) / peak) * 100;
}

/** Simple % return from the first to the last candle in the provided window. */
export function periodReturn(candles: ChartCandle[]): number | null {
  if (candles.length < 2) return null;
  const first = candles[0].close;
  const last = candles[candles.length - 1].close;
  if (first === 0) return null;
  return ((last - first) / first) * 100;
}

/** Compound annual growth rate (%) over the provided window, given its span in years. */
export function cagr(candles: ChartCandle[], years: number): number | null {
  if (candles.length < 2 || years <= 0) return null;
  const first = candles[0].close;
  const last = candles[candles.length - 1].close;
  if (first <= 0 || last <= 0) return null;
  return ((last / first) ** (1 / years) - 1) * 100;
}

/** Pearson correlation of daily returns between two aligned close-price series. Null below MIN_POINTS_FOR_CORRELATION. */
export function pearsonCorrelation(seriesA: number[], seriesB: number[]): number | null {
  const n = Math.min(seriesA.length, seriesB.length);
  if (n < 2) return null;

  const a = seriesA.slice(seriesA.length - n);
  const b = seriesB.slice(seriesB.length - n);
  const meanA = a.reduce((sum, v) => sum + v, 0) / n;
  const meanB = b.reduce((sum, v) => sum + v, 0) / n;

  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA === 0 || varB === 0) return null;
  return cov / Math.sqrt(varA * varB);
}

/** Daily log returns from a candle series — the input pearsonCorrelation expects, aligned by array position (caller aligns by date first). */
export function dailyReturns(candles: ChartCandle[]): number[] {
  const closes = closesOf(candles);
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push(Math.log(closes[i] / closes[i - 1]));
  }
  return returns;
}

/** Downsamples a candle series to at most `maxPoints` rows by picking evenly-spaced samples, always keeping the first and last candle. For the model's view only — the chart renderer gets the full series via a separate seriesId. */
export function downsampleCandles(candles: ChartCandle[], maxPoints = 60): ChartCandle[] {
  if (candles.length <= maxPoints) return candles;
  const step = (candles.length - 1) / (maxPoints - 1);
  const sampled: ChartCandle[] = [];
  for (let i = 0; i < maxPoints; i++) {
    sampled.push(candles[Math.round(i * step)]);
  }
  return sampled;
}
