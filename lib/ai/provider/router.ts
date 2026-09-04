import "server-only";
import { generateObject } from "ai";
import type { z } from "zod";
import { resolveModelChoice, NoProviderKeyError } from "./prefs";
import { resolveLanguageModel, type AiLane, type AiProviderName } from "./models";
import { recordAiRun } from "./run-tracking";

export type GenerateStructuredInput<T> = {
  workspaceId: string;
  userId: string;
  lane: AiLane;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  timeoutMs?: number;
};

export type GenerateStructuredResult<T> =
  | { status: "ok"; data: T; degraded: false }
  | { status: "ok"; data: T; degraded: true; reason: string }
  | { status: "unavailable"; reason: string };

const DEFAULT_TIMEOUT_MS = 12_000;

/**
 * Single entry point for every structured LLM call in the AI layer — see
 * PLAN_AI_COPILOT.md §4 "Router rules". Resolves the caller's model via
 * ai_model_prefs/defaults, calls it with a hard timeout, and on any failure
 * (no key, timeout, provider error) falls through exactly once to the
 * `fallback` lane rather than retrying the same provider or looping. Every
 * attempt — success or failure — writes an ai_runs trace row.
 *
 * Callers get back a tagged result, never a thrown error for an ordinary
 * provider failure — an AI feature degrading to "unavailable" must never
 * take down the page or action it's attached to (same reasoning as
 * lib/telegram/notify.ts).
 */
export async function generateStructured<T>(input: GenerateStructuredInput<T>): Promise<GenerateStructuredResult<T>> {
  const primary = await attempt(input, input.lane, false);
  if (primary.status === "ok") return primary.result;
  if (input.lane === "fallback") return { status: "unavailable", reason: primary.reason };

  const secondary = await attempt(input, "fallback", true);
  if (secondary.status === "ok") return secondary.result;

  return { status: "unavailable", reason: `${primary.reason}; fallback also failed: ${secondary.reason}` };
}

type AttemptOutcome<T> = { status: "ok"; result: GenerateStructuredResult<T> } | { status: "error"; reason: string };

async function attempt<T>(input: GenerateStructuredInput<T>, lane: AiLane, degraded: boolean): Promise<AttemptOutcome<T>> {
  const startedAt = Date.now();
  let choice: { provider: AiProviderName; model: string };
  try {
    choice = await resolveModelChoice(input.userId, lane);
  } catch (error) {
    if (error instanceof NoProviderKeyError) return { status: "error", reason: error.message };
    throw error;
  }

  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const result = await generateObject({
      model: resolveLanguageModel(choice),
      schema: input.schema,
      system: input.system,
      prompt: input.prompt,
      abortSignal: AbortSignal.timeout(timeoutMs),
    });

    void recordAiRun({
      workspaceId: input.workspaceId,
      lane,
      provider: choice.provider,
      model: choice.model,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      latencyMs: Date.now() - startedAt,
      status: "ok",
    });

    return {
      status: "ok",
      result: degraded
        ? { status: "ok", data: result.object, degraded: true, reason: `primary lane "${input.lane}" unavailable, used fallback` }
        : { status: "ok", data: result.object, degraded: false },
    };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    const reason = error instanceof Error ? error.message : "unknown error";

    void recordAiRun({
      workspaceId: input.workspaceId,
      lane,
      provider: choice.provider,
      model: choice.model,
      latencyMs: Date.now() - startedAt,
      status: isTimeout ? "timeout" : "error",
      errorCode: reason.slice(0, 200),
    });

    return { status: "error", reason };
  }
}
