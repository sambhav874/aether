"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { aiModelPrefs } from "@/db/schema/ai";
import { requireActiveWorkspace } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit/log";
import { DEFAULT_MODELS, MODEL_CATALOG, availableProviders, type AiLane, type AiProviderName } from "@/lib/ai/provider/models";

export type ModelPrefRow = {
  lane: AiLane;
  provider: AiProviderName;
  model: string;
  isOverride: boolean; // false = showing the shipped default, no row in ai_model_prefs yet
};

const LANES: AiLane[] = ["routing", "main_loop", "deep_synthesis", "sub_agent", "fallback"];

/** Every lane's effective choice (override if set, else the shipped default) plus the catalog of models the workspace actually has a key for — see PLAN_AI_COPILOT.md §4.1. */
export async function getModelPrefs(): Promise<{ rows: ModelPrefRow[]; catalog: typeof MODEL_CATALOG; availableProviders: AiProviderName[] }> {
  const { session } = await requireActiveWorkspace();

  const overrides = await db.query.aiModelPrefs.findMany({
    where: eq(aiModelPrefs.userId, session.user.id),
  });
  const byLane = new Map(overrides.map((o) => [o.lane, o]));

  const rows: ModelPrefRow[] = LANES.map((lane) => {
    const override = byLane.get(lane);
    if (override && (override.provider === "groq" || override.provider === "openai" || override.provider === "google")) {
      return { lane, provider: override.provider, model: override.model, isOverride: true };
    }
    return { lane, ...DEFAULT_MODELS[lane], isOverride: false };
  });

  return { rows, catalog: MODEL_CATALOG, availableProviders: availableProviders() };
}

export async function saveModelPref(lane: AiLane, provider: AiProviderName, model: string): Promise<void> {
  const { workspace, session } = await requireActiveWorkspace();

  await db
    .insert(aiModelPrefs)
    .values({ id: crypto.randomUUID(), userId: session.user.id, lane, provider, model })
    .onConflictDoUpdate({
      target: [aiModelPrefs.userId, aiModelPrefs.lane],
      set: { provider, model, updatedAt: new Date() },
    });

  await logAudit({
    workspaceId: workspace.id,
    actorId: session.user.id,
    action: "ai.model_pref_updated",
    summary: `Set ${lane} lane to ${provider}/${model}`,
  });

  revalidatePath("/dashboard/settings");
}

/** Clears a lane's override — it reverts to the shipped default. */
export async function resetModelPref(lane: AiLane): Promise<void> {
  const { workspace, session } = await requireActiveWorkspace();

  await db.delete(aiModelPrefs).where(and(eq(aiModelPrefs.userId, session.user.id), eq(aiModelPrefs.lane, lane)));

  await logAudit({
    workspaceId: workspace.id,
    actorId: session.user.id,
    action: "ai.model_pref_reset",
    summary: `Reset ${lane} lane to the shipped default`,
  });

  revalidatePath("/dashboard/settings");
}
