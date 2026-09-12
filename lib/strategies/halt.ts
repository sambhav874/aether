import "server-only";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { tradingHalts } from "@/db/schema";

export type HaltState = { halted: false } | { halted: true; scope: "platform" | "workspace"; reason: string };

/**
 * Checked at the top of dispatchSignal, before any broker lookup.
 *
 * A platform-wide halt (workspaceId null) outranks a workspace one, and is
 * reported as such — during an incident "who stopped this" is the first
 * question, and "the platform is down" and "your workspace is paused" want
 * very different responses from whoever is reading the signal row.
 */
export async function checkTradingHalt(workspaceId: string): Promise<HaltState> {
  const active = await db
    .select({ workspaceId: tradingHalts.workspaceId, reason: tradingHalts.reason })
    .from(tradingHalts)
    .where(
      and(
        isNull(tradingHalts.liftedAt),
        or(isNull(tradingHalts.workspaceId), eq(tradingHalts.workspaceId, workspaceId)),
      ),
    );

  if (active.length === 0) return { halted: false };

  const platform = active.find((h) => h.workspaceId === null);
  if (platform) return { halted: true, scope: "platform", reason: platform.reason };
  return { halted: true, scope: "workspace", reason: active[0].reason };
}

/** Wording the signal row and the Telegram alert both carry. */
export function haltMessage(state: Extract<HaltState, { halted: true }>): string {
  const who = state.scope === "platform" ? "Trading is halted platform-wide" : "Trading is halted for this workspace";
  return `${who} — ${state.reason}`;
}
