import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiModelPrefs } from "@/db/schema/ai";
import { DEFAULT_MODELS, hasKeyFor, type AiLane, type AiProviderName, type ModelChoice } from "./models";

export class NoProviderKeyError extends Error {
  constructor(public readonly provider: AiProviderName) {
    super(`no API key configured for provider "${provider}"`);
    this.name = "NoProviderKeyError";
  }
}

function isLlmProvider(provider: string): provider is AiProviderName {
  return provider === "groq" || provider === "openai" || provider === "google";
}

/**
 * Resolves the model a lane should use for this user — see
 * PLAN_AI_COPILOT.md §4.1. Order: the user's own ai_model_prefs override for
 * this lane (if the workspace has a key for that provider), else the
 * shipped default for the lane, else the `fallback` lane's model. Never
 * returns a choice this deployment has no key to actually call — throws
 * NoProviderKeyError instead, which the router turns into a rule-only /
 * degraded response rather than a crash.
 */
export async function resolveModelChoice(userId: string, lane: AiLane): Promise<ModelChoice> {
  const override = await db.query.aiModelPrefs.findFirst({
    where: and(eq(aiModelPrefs.userId, userId), eq(aiModelPrefs.lane, lane)),
  });

  const preferred: ModelChoice =
    override && isLlmProvider(override.provider) ? { provider: override.provider, model: override.model } : DEFAULT_MODELS[lane];

  if (hasKeyFor(preferred.provider)) return preferred;

  const fallback = DEFAULT_MODELS.fallback;
  if (lane !== "fallback" && hasKeyFor(fallback.provider)) return fallback;

  throw new NoProviderKeyError(preferred.provider);
}
