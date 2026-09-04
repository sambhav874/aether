import { groq } from "@ai-sdk/groq";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import type { aiLaneEnum, aiProviderEnum } from "@/db/schema/ai";

export type AiLane = (typeof aiLaneEnum.enumValues)[number];
export type AiProviderName = Exclude<(typeof aiProviderEnum.enumValues)[number], "keiro">;

export type ModelChoice = { provider: AiProviderName; model: string };

/**
 * Defaults per PLAN_AI_COPILOT.md §4 — every lane is user-overridable via
 * ai_model_prefs (§4.1); this table is both the seed data for that override
 * UI and the fallback when a user has no preference set for a lane. Model
 * ids were verified live (web search, 2026-08-13) rather than trusted from
 * training data — these lineups ship monthly, so re-check at wiring time.
 *
 * Note on `deep_synthesis`/`sub_agent` using gpt-5.6-luna: in OpenAI's own
 * Sol/Terra/Luna split, Luna is the cheapest, fastest, most cost-sensitive
 * tier — not the reasoning-flagship tier (that's Sol). Set here on request;
 * swap to "gpt-5.6-sol" for the deepest reasoning available if a lane needs
 * it. Either way this is a one-line change here or a per-user override in
 * ai_model_prefs, never a redesign.
 */
export const DEFAULT_MODELS: Record<AiLane, ModelChoice> = {
  routing: { provider: "groq", model: "openai/gpt-oss-120b" },
  main_loop: { provider: "google", model: "gemini-3.6-flash" },
  deep_synthesis: { provider: "openai", model: "gpt-5.6-luna" },
  sub_agent: { provider: "openai", model: "gpt-5.6-luna" },
  fallback: { provider: "groq", model: "openai/gpt-oss-120b" },
};

const ENV_KEY_BY_PROVIDER: Record<AiProviderName, string> = {
  groq: "GROQ_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

export function envKeyNameFor(provider: AiProviderName): string {
  return ENV_KEY_BY_PROVIDER[provider];
}

export function hasKeyFor(provider: AiProviderName): boolean {
  return Boolean(process.env[ENV_KEY_BY_PROVIDER[provider]]);
}

/** Every provider this workspace currently has a platform key for — feeds the Settings → AI per-lane dropdown (§4.1): only offer models the call can actually succeed with. */
export function availableProviders(): AiProviderName[] {
  return (Object.keys(ENV_KEY_BY_PROVIDER) as AiProviderName[]).filter(hasKeyFor);
}

/**
 * The small, curated set of models offered per provider in the Settings →
 * AI picker (§4.1) — not an exhaustive live catalog (no provider here
 * exposes a stable "list models" endpoint worth depending on), just the
 * handful worth choosing between. Verified live alongside DEFAULT_MODELS
 * above; re-check at the same cadence.
 */
export const MODEL_CATALOG: Record<AiProviderName, { model: string; label: string; note: string }[]> = {
  groq: [
    { model: "openai/gpt-oss-120b", label: "ChatGPT OSS 120B", note: "OpenAI's flagship open-weight 120B reasoning model hosted on Groq LPUs" },
  ],
  google: [
    { model: "gemini-3.6-flash", label: "Gemini 3.6 Flash", note: "GA, cheapest of the three, agentic-planning tuned" },
    { model: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", note: "Cheapest/fastest — built for high-volume sub-agent calls" },
    { model: "gemini-3.1-pro", label: "Gemini 3.1 Pro", note: "Deeper reasoning, higher cost" },
  ],
  openai: [
    { model: "gpt-5.6-luna", label: "GPT-5.6 Luna", note: "Cheapest, fastest — cost-sensitive tier, not the reasoning flagship" },
    { model: "gpt-5.6-terra", label: "GPT-5.6 Terra", note: "Mid tier" },
    { model: "gpt-5.6-sol", label: "GPT-5.6 Sol", note: "Flagship reasoning — the deepest available, highest cost" },
  ],
};

export function resolveLanguageModel(choice: ModelChoice): LanguageModel {
  switch (choice.provider) {
    case "groq":
      return groq(choice.model);
    case "openai":
      return openai(choice.model);
    case "google":
      return google(choice.model);
  }
}
