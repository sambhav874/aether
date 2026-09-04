import "server-only";
import { db } from "@/db/client";
import { aiRuns } from "@/db/schema/ai";
import type { AiLane, AiProviderName } from "./models";

export type RunOutcome = {
  workspaceId: string;
  lane: AiLane;
  provider: AiProviderName;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs: number;
  steps?: number;
  status: "ok" | "error" | "timeout";
  errorCode?: string;
};

/**
 * One row per LLM call anywhere in the AI layer — see
 * PLAN_AI_COPILOT.md §5 / §6. Never awaited by callers on the hot path for
 * the same reason lib/telegram/notify.ts's notifyWorkspace isn't: a trace
 * write must never be the thing that makes a user-facing answer slower or
 * fail. Errors here are logged, not thrown.
 */
export async function recordAiRun(outcome: RunOutcome): Promise<void> {
  try {
    await db.insert(aiRuns).values({
      id: crypto.randomUUID(),
      workspaceId: outcome.workspaceId,
      lane: outcome.lane,
      provider: outcome.provider,
      model: outcome.model,
      inputTokens: outcome.inputTokens ?? null,
      outputTokens: outcome.outputTokens ?? null,
      costUsd: outcome.costUsd !== undefined ? outcome.costUsd.toFixed(6) : null,
      latencyMs: outcome.latencyMs,
      steps: outcome.steps ?? null,
      status: outcome.status,
      errorCode: outcome.errorCode ?? null,
    });
  } catch (error) {
    console.error("[ai/run-tracking] failed to record ai_runs row —", error);
  }
}
