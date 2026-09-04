import { describe, it, expect, vi, beforeEach } from "vitest";

const { findFirstMock, findManyMock, valuesMock, insertMock, whereMock, setMock, updateMock } = vi.hoisted(() => {
  const valuesMock = vi.fn(async () => undefined);
  const whereMock = vi.fn(async () => undefined);
  const setMock = vi.fn(() => ({ where: whereMock }));
  return {
    findFirstMock: vi.fn(),
    findManyMock: vi.fn(),
    valuesMock,
    insertMock: vi.fn(() => ({ values: valuesMock })),
    whereMock,
    setMock,
    updateMock: vi.fn(() => ({ set: setMock })),
  };
});

vi.mock("@/db/client", () => ({
  db: {
    query: { aiThreads: { findFirst: findFirstMock }, aiMessages: { findMany: findManyMock } },
    insert: insertMock,
    update: updateMock,
  },
}));

import { ensureOwnedThread, appendUserMessage, appendAssistantMessage, getThreadHistory, touchThread } from "./thread";

const ctx = { workspaceId: "ws_1", userId: "user_1" };

beforeEach(() => {
  findFirstMock.mockReset();
  findManyMock.mockReset();
  valuesMock.mockClear();
  insertMock.mockClear();
  whereMock.mockClear();
  setMock.mockClear();
  updateMock.mockClear();
});

describe("ensureOwnedThread", () => {
  it("returns the existing thread's id when it resolves to one owned by this workspace+user", async () => {
    findFirstMock.mockResolvedValue({ id: "thread_1", workspaceId: ctx.workspaceId, userId: ctx.userId });

    const result = await ensureOwnedThread("thread_1", ctx);
    expect(result).toEqual({ id: "thread_1", isNew: false });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("creates a new thread using the SAME id the client supplied when it doesn't resolve to an owned thread — required so the client's chat id and the server's thread id never diverge across a multi-turn conversation", async () => {
    findFirstMock.mockResolvedValue(undefined);

    const result = await ensureOwnedThread("client-generated-id", ctx);
    expect(result).toEqual({ id: "client-generated-id", isNew: true });
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({ id: "client-generated-id", workspaceId: ctx.workspaceId, userId: ctx.userId }));
  });

  it("mints a fresh id when no threadId is given at all", async () => {
    const result = await ensureOwnedThread(undefined, ctx);
    expect(result.isNew).toBe(true);
    expect(typeof result.id).toBe("string");
    expect(result.id.length).toBeGreaterThan(0);
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("does not trust a threadId belonging to a different workspace/user — falls through to creating a new thread rather than erroring in a way that would confirm the id exists", async () => {
    // Simulates the ownership WHERE clause finding nothing because the id
    // belongs to someone else — from this function's perspective that's
    // indistinguishable from "no such thread", by design.
    findFirstMock.mockResolvedValue(undefined);

    const result = await ensureOwnedThread("someone-elses-thread", ctx);
    expect(result.isNew).toBe(true);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("stores the pinnedSymbol only on creation", async () => {
    findFirstMock.mockResolvedValue(undefined);
    await ensureOwnedThread(undefined, ctx, "TCS");
    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({ pinnedSymbol: "TCS" }));
  });
});

describe("appendUserMessage / appendAssistantMessage", () => {
  it("inserts a user message with role='user' and touches the thread", async () => {
    await appendUserMessage("thread_1", "what's my win rate");
    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({ threadId: "thread_1", role: "user", content: "what's my win rate" }));
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("inserts an assistant message carrying tool call trace + evidence + provider/model", async () => {
    await appendAssistantMessage("thread_1", {
      content: "Your win rate this month is 61%.",
      toolCalls: [{ name: "analyze_my_performance", args: { dimension: "overall", period: "30d" }, resultDigest: "{...}", latencyMs: 120, status: "ok" }],
      evidence: { call_1: { tool: "analyze_my_performance", output: { kpis: { winRate: 61 } } } },
      provider: "google",
      model: "gemini-3.6-flash",
      inputTokens: 500,
      outputTokens: 40,
      costUsd: 0.0004,
    });

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "assistant",
        provider: "google",
        model: "gemini-3.6-flash",
        costUsd: "0.000400",
      }),
    );
  });
});

describe("getThreadHistory", () => {
  it("returns only role+content — tool traces and evidence stay server-side, never re-fed into the prompt", async () => {
    findManyMock.mockResolvedValue([
      { role: "user", content: "hi", toolCalls: null, evidence: null },
      { role: "assistant", content: "hello", toolCalls: [{ name: "x" }], evidence: { a: 1 } },
    ]);

    const history = await getThreadHistory("thread_1");
    expect(history).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });
});

describe("touchThread", () => {
  it("updates lastMessageAt for the given thread", async () => {
    await touchThread("thread_1");
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ lastMessageAt: expect.any(Date) }));
  });
});
