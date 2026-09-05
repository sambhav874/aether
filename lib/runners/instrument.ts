import "server-only";
import { emit } from "@/lib/observability/trace";
import type { BrokerRunner } from "@/lib/runners/types";

/** Broker calls that are worth timing — everything that crosses the network. */
const TIMED_METHODS = [
  "connectAccount",
  "getBalance",
  "getPositions",
  "placeOrder",
  "closePosition",
] as const satisfies readonly (keyof BrokerRunner)[];

type TimedMethod = (typeof TIMED_METHODS)[number];

/** A rejected order is a resolved promise, not a throw — capture both shapes. */
function outcomeOf(result: unknown): { status?: string; message?: string } {
  if (typeof result !== "object" || result === null) return {};
  const r = result as { status?: unknown; message?: unknown };
  return {
    status: typeof r.status === "string" ? r.status : undefined,
    message: typeof r.message === "string" ? r.message : undefined,
  };
}

/**
 * Wraps a broker adapter so every network call it makes is timed and logged.
 *
 * Applied centrally in `getRunner` rather than at each call site: dispatch,
 * the sync job, the limit-order poller and the manual order panel all go
 * through that one function, so this covers every path without any of them
 * knowing about it.
 *
 * The `accountId` is our internal broker_accounts.id, which is safe to log —
 * it is not the broker's own account number and carries no credential.
 */
export function instrumentRunner(runner: BrokerRunner): BrokerRunner {
  const wrapped = Object.create(runner) as BrokerRunner;

  for (const method of TIMED_METHODS) {
    const original = runner[method] as (...args: unknown[]) => Promise<unknown>;

    Object.defineProperty(wrapped, method, {
      configurable: true,
      writable: true,
      value: async (...args: unknown[]) => {
        const startedAt = performance.now();
        const accountId = typeof args[0] === "string" ? args[0] : undefined;

        try {
          const result = await original.apply(runner, args);
          const { status, message } = outcomeOf(result);
          emit("broker.call", {
            provider: runner.provider,
            method,
            accountId,
            durationMs: Math.round(performance.now() - startedAt),
            ok: status === undefined || status === "executed",
            // The broker's own rejection reason — the field that was missing
            // when an order came back rejected and nobody could say why.
            brokerStatus: status,
            brokerMessage: message,
          });
          return result;
        } catch (error) {
          emit("broker.call", {
            provider: runner.provider,
            method,
            accountId,
            durationMs: Math.round(performance.now() - startedAt),
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
    });
  }

  return wrapped;
}

export type { TimedMethod };
