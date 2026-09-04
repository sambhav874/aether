import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiThreads, aiMessages } from "@/db/schema/ai";
import type { AiProviderName } from "@/lib/ai/provider/models";

export type ThreadCtx = { workspaceId: string; userId: string };

/**
 * Loads a thread and verifies it belongs to this exact user+workspace, or
 * creates one if `threadId` doesn't resolve to an owned thread. Never
 * trusts a client-supplied thread id for *reads* — see
 * PLAN_AI_COPILOT.md §7 "Cross-workspace data leak", the one bug in this
 * plan with real consequences. A threadId that doesn't resolve to this
 * user's own thread is treated exactly like no threadId at all (a new
 * thread is created) rather than surfaced as an error that would confirm
 * the id's existence to a caller probing for it.
 *
 * On creation, the *id itself* is still taken from the caller when given,
 * rather than minted fresh server-side — useChat's client generates its own
 * id up front and needs the server to adopt the same one on the very first
 * message, or every later message in the thread would silently start a new
 * thread instead of continuing it. This is safe because ownership is never
 * derived from the id alone (every read above re-checks workspaceId+userId)
 * — an attacker guessing/colliding with an existing id here just hits the
 * table's primary-key constraint on insert, not another user's data.
 */
export async function ensureOwnedThread(threadId: string | undefined, ctx: ThreadCtx, pinnedSymbol?: string | null): Promise<{ id: string; isNew: boolean }> {
  if (threadId) {
    const existing = await db.query.aiThreads.findFirst({
      where: and(eq(aiThreads.id, threadId), eq(aiThreads.workspaceId, ctx.workspaceId), eq(aiThreads.userId, ctx.userId)),
    });
    if (existing) return { id: existing.id, isNew: false };
  }

  const id = threadId ?? crypto.randomUUID();
  await db.insert(aiThreads).values({
    id,
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    pinnedSymbol: pinnedSymbol ?? null,
  });
  return { id, isNew: true };
}

export async function touchThread(threadId: string): Promise<void> {
  await db.update(aiThreads).set({ lastMessageAt: new Date() }).where(eq(aiThreads.id, threadId));
}

export async function appendUserMessage(threadId: string, content: string): Promise<void> {
  await db.insert(aiMessages).values({ id: crypto.randomUUID(), threadId, role: "user", content });
  await touchThread(threadId);
}

export type AssistantTurn = {
  content: string;
  toolCalls: { name: string; args: unknown; resultDigest: string; latencyMs: number; status: "ok" | "error" }[];
  evidence: Record<string, unknown>;
  provider: AiProviderName;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
};

export async function appendAssistantMessage(threadId: string, turn: AssistantTurn): Promise<void> {
  await db.insert(aiMessages).values({
    id: crypto.randomUUID(),
    threadId,
    role: "assistant",
    content: turn.content,
    toolCalls: turn.toolCalls,
    evidence: turn.evidence,
    provider: turn.provider,
    model: turn.model,
    inputTokens: turn.inputTokens ?? null,
    outputTokens: turn.outputTokens ?? null,
    costUsd: turn.costUsd !== undefined ? turn.costUsd.toFixed(6) : null,
  });
  await touchThread(threadId);
}

export type ThreadMessage = { role: "user" | "assistant" | "system"; content: string };

/** Prior turns for this thread, oldest first — used to seed the model's message history on a follow-up request. Only role+content travel back to the model; tool-call traces and evidence stay server-side (they're for the UI's evidence cards and the eval harness, not for re-feeding into the prompt). */
export async function getThreadHistory(threadId: string, limit = 40): Promise<ThreadMessage[]> {
  const rows = await db.query.aiMessages.findMany({
    where: eq(aiMessages.threadId, threadId),
    orderBy: (message, { asc }) => asc(message.createdAt),
    limit,
  });
  return rows.map((r) => ({ role: r.role, content: r.content }));
}
