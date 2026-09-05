import { afterEach, describe, expect, it, vi } from "vitest";
import { BROKER_TIMEOUT_MS, HttpTimeoutError, fetchWithTimeout } from "@/lib/http";

afterEach(() => vi.unstubAllGlobals());

describe("fetchWithTimeout", () => {
  it("passes the response through when the peer answers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
    const response = await fetchWithTimeout("https://example.test/quote");
    expect(response.status).toBe(200);
  });

  it("aborts a peer that accepts the connection and never replies", async () => {
    // The exact failure bare fetch has no answer for: no response, no error,
    // request held until the platform kills the function.
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: unknown, init: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        });
      }),
    );

    await expect(
      fetchWithTimeout("https://example.test/hangs", { timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(HttpTimeoutError);
  });

  it("names the url and budget in the timeout error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: unknown, init: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        });
      }),
    );

    await expect(
      fetchWithTimeout("https://broker.test/order", { timeoutMs: 15 }),
    ).rejects.toThrow(/broker\.test\/order.*15ms/);
  });

  it("still honours a caller's own abort signal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: unknown, init: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted by caller")));
        });
      }),
    );

    const controller = new AbortController();
    const pending = fetchWithTimeout("https://example.test/slow", {
      signal: controller.signal,
      timeoutMs: 5_000,
    });
    controller.abort();
    await expect(pending).rejects.toThrow("aborted by caller");
  });

  it("gives broker calls a tighter budget than market data", async () => {
    // A broker order has to fail inside the same trading decision.
    expect(BROKER_TIMEOUT_MS).toBeLessThan(10_000);
  });
});
