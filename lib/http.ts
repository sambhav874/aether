/**
 * Outbound HTTP with a mandatory deadline.
 *
 * Bare `fetch` has no timeout: a peer that accepts the connection and then
 * never responds holds the request until the platform kills the whole
 * function. On the order path that means a single unresponsive broker stalls
 * every account behind it in the dispatch loop, and the caller is told
 * nothing until the 60s ceiling hits.
 *
 * Timeouts are deliberately per-class rather than one global number — a
 * broker order must fail fast so the caller can react inside the same
 * session, while a news feed can afford to wait.
 */

/** Broker order placement and account calls — must fail inside a trading decision. */
export const BROKER_TIMEOUT_MS = 8_000;
/** Quotes, candles, fundamentals — user is waiting on a render. */
export const MARKET_DATA_TIMEOUT_MS = 10_000;
/** RSS, news, web search, Telegram — background-ish, can be slower. */
export const CONTENT_TIMEOUT_MS = 15_000;

export type TimedRequestInit = RequestInit & { timeoutMs?: number };

export class HttpTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = "HttpTimeoutError";
  }
}

/**
 * `fetch` that always aborts by `timeoutMs` (default: market-data budget).
 * A caller-supplied `signal` still works — whichever fires first wins.
 */
export async function fetchWithTimeout(
  input: string | URL | Request,
  init: TimedRequestInit = {},
): Promise<Response> {
  const { timeoutMs = MARKET_DATA_TIMEOUT_MS, signal, ...rest } = init;

  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  try {
    return await fetch(input, { ...rest, signal: combined });
  } catch (error) {
    // AbortSignal.timeout aborts with a TimeoutError DOMException; surface it
    // as something a caller can distinguish from a network failure or from
    // its own cancellation.
    if (timeout.aborted) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      throw new HttpTimeoutError(url, timeoutMs);
    }
    throw error;
  }
}
