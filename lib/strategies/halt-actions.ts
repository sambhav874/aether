"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { tradingHalts } from "@/db/schema";
import { requireActiveWorkspace } from "@/lib/auth/session";
import { hasWorkspacePermission } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit/log";
import { checkTradingHalt, type HaltState } from "@/lib/strategies/halt";
import { haltReasonSchema, parseInput } from "@/lib/strategies/schemas";

type ActionResult = { error?: string; success?: boolean };

/**
 * Gated on trading:execute rather than a management permission. Whoever can
 * place an order must be able to stop one — requiring an admin to be awake
 * defeats the point of a kill switch.
 */
export async function haltTrading(reason: string): Promise<ActionResult> {
  const { workspace, session, role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { trading: ["execute"] })) {
    return { error: "You don't have permission to halt trading." };
  }

  const parsed = parseInput(haltReasonSchema, reason);
  if (!parsed.ok) return { error: "Give a reason — it's what you'll read back during the post-mortem." };
  const trimmed = parsed.data;

  const existing = await checkTradingHalt(workspace.id);
  if (existing.halted) return { error: "Trading is already halted." };

  await db.insert(tradingHalts).values({
    id: crypto.randomUUID(),
    workspaceId: workspace.id,
    reason: trimmed,
    haltedBy: session.user.id,
  });

  await logAudit({
    workspaceId: workspace.id,
    actorId: session.user.id,
    action: "trading.halted",
    summary: `Halted all trading — ${trimmed}`,
  });

  revalidatePath("/dashboard");
  return { success: true };
}

/** Lifts this workspace's own halt. A platform-wide halt is not liftable here. */
export async function resumeTrading(): Promise<ActionResult> {
  const { workspace, session, role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { trading: ["execute"] })) {
    return { error: "You don't have permission to resume trading." };
  }

  const [active] = await db
    .select({ id: tradingHalts.id })
    .from(tradingHalts)
    .where(and(eq(tradingHalts.workspaceId, workspace.id), isNull(tradingHalts.liftedAt)))
    .orderBy(desc(tradingHalts.haltedAt))
    .limit(1);

  if (!active) {
    return { error: "No workspace halt is active. A platform-wide halt can only be lifted by an operator." };
  }

  await db
    .update(tradingHalts)
    .set({ liftedAt: new Date(), liftedBy: session.user.id })
    .where(eq(tradingHalts.id, active.id));

  await logAudit({
    workspaceId: workspace.id,
    actorId: session.user.id,
    action: "trading.resumed",
    summary: "Resumed trading",
  });

  revalidatePath("/dashboard");
  return { success: true };
}

export async function getHaltState(): Promise<HaltState> {
  const { workspace } = await requireActiveWorkspace();
  return checkTradingHalt(workspace.id);
}
