/**
 * Structured trace events for the order path.
 *
 * Emitted as one JSON object per line on stdout rather than to a vendor SDK:
 * that works unchanged on Vercel today and on the broker worker later, and
 * any aggregator (Sentry, Better Stack, Datadog, `jq` over `vercel logs`)
 * can ingest it. Swapping in a real transport later means changing `emit`
 * and nothing else.
 *
 * This exists because "the order was rejected because the server was slow"
 * was, until now, an untestable hypothesis: there was no per-stage timing
 * anywhere on the path from webhook to broker.
 */

export type TraceFields = Record<string, unknown>;

/** One structured line. Never throws — telemetry must not break dispatch. */
export function emit(event: string, fields: TraceFields = {}): void {
  try {
    console.log(JSON.stringify({ event, at: new Date().toISOString(), ...fields }));
  } catch {
    // A field that can't be serialized is not worth losing an order over.
    console.log(JSON.stringify({ event, at: new Date().toISOString(), unserializable: true }));
  }
}

export type StageTimer = {
  /** Records elapsed ms since the previous mark under `stage`. */
  mark(stage: string): void;
  /** Milliseconds since the timer was created. */
  totalMs(): number;
  /** Per-stage durations in the order they were marked. */
  stages(): Record<string, number>;
};

/**
 * Measures the gaps between stages of a single signal:
 * received -> parsed -> authorized -> rate_limited -> persisted -> dispatched.
 *
 * Deliberately records the delta between marks rather than absolute offsets —
 * when an order is late, the question is always "which step ate the time",
 * and deltas answer that without arithmetic.
 */
export function createStageTimer(): StageTimer {
  const start = performance.now();
  let previous = start;
  const stages: Record<string, number> = {};

  return {
    mark(stage) {
      const now = performance.now();
      stages[stage] = Math.round(now - previous);
      previous = now;
    },
    totalMs: () => Math.round(performance.now() - start),
    stages: () => ({ ...stages }),
  };
}
