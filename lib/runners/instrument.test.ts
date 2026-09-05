import { afterEach, describe, expect, it, vi } from "vitest";
import { instrumentRunner } from "@/lib/runners/instrument";
import type { BrokerRunner, ExecutionResult } from "@/lib/runners/types";

const EXECUTED: ExecutionResult = { status: "executed", externalOrderId: "ord-1", message: "ok" };

function fakeRunner(overrides: Partial<BrokerRunner> = {}): BrokerRunner {
  return {
    provider: "motilal",
    reportsAllOpenPositions: false,
    connectAccount: vi.fn(async () => ({ account: {}, credentials: {} })),
    getBalance: vi.fn(async () => ({ balance: 1, equity: 1, currency: "INR", asOf: new Date() })),
    getPositions: vi.fn(async () => []),
    placeOrder: vi.fn(async (): Promise<ExecutionResult> => EXECUTED),
    closePosition: vi.fn(async (): Promise<ExecutionResult> => EXECUTED),
    ...overrides,
  } as unknown as BrokerRunner;
}

function captureEmitted() {
  const lines: Record<string, unknown>[] = [];
  vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    if (typeof line === "string") lines.push(JSON.parse(line));
  });
  return lines;
}

afterEach(() => vi.restoreAllMocks());

describe("instrumentRunner", () => {
  it("forwards arguments and returns the adapter's own result unchanged", async () => {
    // The wrapper sits on the order path — it must be transparent.
    const inner = fakeRunner();
    const order = { symbol: "NIFTY", side: "buy" as const, quantity: 50 };
    captureEmitted();

    const result = await instrumentRunner(inner).placeOrder("acc-1", order);

    expect(inner.placeOrder).toHaveBeenCalledWith("acc-1", order);
    expect(result).toEqual(EXECUTED);
  });

  it("records the broker's own rejection reason", async () => {
    // The field that was missing when an order came back rejected and nobody
    // could say why.
    const inner = fakeRunner({
      placeOrder: vi.fn(async () => ({ status: "rejected", message: "RMS: margin shortfall" })),
    } as Partial<BrokerRunner>);
    const emitted = captureEmitted();

    await instrumentRunner(inner).placeOrder("acc-9", { symbol: "X", side: "buy", quantity: 1 });

    const call = emitted.find((e) => e.event === "broker.call");
    expect(call).toMatchObject({
      provider: "motilal",
      method: "placeOrder",
      accountId: "acc-9",
      ok: false,
      brokerStatus: "rejected",
      brokerMessage: "RMS: margin shortfall",
    });
    expect(typeof call?.durationMs).toBe("number");
  });

  it("marks an executed order as ok", async () => {
    const emitted = captureEmitted();
    await instrumentRunner(fakeRunner()).placeOrder("acc-2", { symbol: "X", side: "buy", quantity: 1 });
    expect(emitted.find((e) => e.event === "broker.call")).toMatchObject({ ok: true });
  });

  it("logs a throw and rethrows it untouched", async () => {
    const boom = new Error("connection reset");
    const inner = fakeRunner({ getPositions: vi.fn(async () => { throw boom; }) } as Partial<BrokerRunner>);
    const emitted = captureEmitted();

    await expect(instrumentRunner(inner).getPositions("acc-3")).rejects.toBe(boom);
    expect(emitted.find((e) => e.event === "broker.call")).toMatchObject({
      method: "getPositions",
      ok: false,
      error: "connection reset",
    });
  });

  it("preserves non-method properties", () => {
    const wrapped = instrumentRunner(fakeRunner({ reportsAllOpenPositions: true } as Partial<BrokerRunner>));
    expect(wrapped.provider).toBe("motilal");
    expect(wrapped.reportsAllOpenPositions).toBe(true);
  });

  it("times every network-crossing method, not just placeOrder", async () => {
    const emitted = captureEmitted();
    const wrapped = instrumentRunner(fakeRunner());

    await wrapped.getBalance("acc-4");
    await wrapped.getPositions("acc-4");
    await wrapped.closePosition("acc-4", "pos-1");

    expect(emitted.map((e) => e.method)).toEqual(["getBalance", "getPositions", "closePosition"]);
  });
});
