"use server";

import { headers } from "next/headers";
import { eq, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  strategies,
  strategyAccounts,
  strategyRiskSettings,
  strategyTrailingRules,
  strategyPartialRules,
  strategyNotificationPrefs,
  strategyNotificationChannels,
  strategyAccess,
  telegramConnections,
} from "@/db/schema";
import { requireActiveWorkspace } from "@/lib/auth/session";
import { generateWebhookSecret } from "@/lib/strategies/webhook-secret";
import { checkStrategyPermission, type StrategyPermissionLevel } from "@/lib/strategies/permissions";
import { auth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit/log";
import { getStrategyDetail } from "@/lib/strategies/detail-queries";
import { getPositionsByStrategy } from "@/lib/positions/queries";
import type {
  StrategyRiskSettings as RiskSettingsInput,
  TrailingRuleRow,
  PartialRuleRow,
  NotificationEvent,
  ShareEntry,
  StrategyDetail,
} from "@/lib/strategies/types";

type ActionResult = { error?: string; success?: boolean };

const STRATEGIES_PATH = "/dashboard/monarch/strategies";

async function guard(strategyId: string, min: StrategyPermissionLevel) {
  const { workspace, session, role } = await requireActiveWorkspace();
  const check = await checkStrategyPermission(session.user.id, role, strategyId, min);
  return { workspace, session, role, check };
}

/** Fetches everything the expanded row + its 8 modals need, gated at
 * "view" — the caller (strategy-list.tsx) only mounts the fetch once a row
 * expands, so this isn't in the initial page load. */
export async function getStrategyDetailAction(strategyId: string): Promise<StrategyDetail | null> {
  const { workspace, session, role } = await requireActiveWorkspace();
  const check = await checkStrategyPermission(session.user.id, role, strategyId, "view");
  if (!check.ok) return null;
  return getStrategyDetail(strategyId, workspace.id, session.user.id, role);
}

export async function fetchStrategyPositions(strategyId: string) {
  const { session, role } = await requireActiveWorkspace();
  const check = await checkStrategyPermission(session.user.id, role, strategyId, "view");
  if (!check.ok) return [];
  return getPositionsByStrategy(strategyId);
}

export async function updateStrategyRisk(
  strategyId: string,
  input: Partial<RiskSettingsInput>,
): Promise<ActionResult> {
  const { check } = await guard(strategyId, "edit_execute");
  if (!check.ok) return { error: check.error };

  const values = {
    sizingMethod: input.sizingMethod ?? null,
    totalCapital: input.totalCapital?.toString() ?? null,
    availableCapital: input.availableCapital?.toString() ?? null,
    maxConcurrentPositions: input.maxConcurrentPositions?.toString() ?? null,
    maxPositionsPerSymbol: input.maxPositionsPerSymbol?.toString() ?? null,
    dailyTradeLimit: input.dailyTradeLimit?.toString() ?? null,
    allowMultipleSameSide: input.allowMultipleSameSide ?? false,
    maxRiskPct: input.maxRiskPct?.toString() ?? null,
    maxRiskPips: input.maxRiskPips?.toString() ?? null,
    stopLossType: input.stopLossType ?? null,
    defaultStopLossPct: input.defaultStopLossPct?.toString() ?? null,
    riskRewardRatio: input.riskRewardRatio?.toString() ?? null,
    partialBookingR: input.partialBookingR?.toString() ?? null,
  };

  await db
    .insert(strategyRiskSettings)
    .values({ strategyId, ...values })
    .onConflictDoUpdate({ target: strategyRiskSettings.strategyId, set: { ...values, updatedAt: new Date() } });

  revalidatePath(STRATEGIES_PATH);
  return { success: true };
}

export async function updateStrategyExitRules(
  strategyId: string,
  trailingRules: Omit<TrailingRuleRow, "id">[],
  partialRules: Omit<PartialRuleRow, "id">[],
): Promise<ActionResult> {
  const { check } = await guard(strategyId, "edit_execute");
  if (!check.ok) return { error: check.error };

  const totalExit = partialRules.reduce((sum, r) => sum + r.exitPct, 0);
  if (totalExit > 100) {
    return { error: `Partial booking rules add up to ${totalExit}% — must be 100% or less.` };
  }
  if (trailingRules.some((r) => r.rrLevel <= 0) || partialRules.some((r) => r.rrLevel <= 0)) {
    return { error: "R:R level must be greater than 0." };
  }
  if (partialRules.some((r) => r.exitPct <= 0 || r.exitPct > 100)) {
    return { error: "Exit % must be between 0 and 100." };
  }

  await db.transaction(async (tx) => {
    await tx.delete(strategyTrailingRules).where(eq(strategyTrailingRules.strategyId, strategyId));
    await tx.delete(strategyPartialRules).where(eq(strategyPartialRules.strategyId, strategyId));
    if (trailingRules.length > 0) {
      await tx.insert(strategyTrailingRules).values(
        trailingRules.map((r, i) => ({
          id: crypto.randomUUID(),
          strategyId,
          rrLevel: r.rrLevel.toString(),
          trailingType: r.trailingType,
          sortOrder: i,
        })),
      );
    }
    if (partialRules.length > 0) {
      await tx.insert(strategyPartialRules).values(
        partialRules.map((r, i) => ({
          id: crypto.randomUUID(),
          strategyId,
          rrLevel: r.rrLevel.toString(),
          exitPct: r.exitPct.toString(),
          sortOrder: i,
        })),
      );
    }
  });

  revalidatePath(STRATEGIES_PATH);
  return { success: true };
}

export async function updateStrategyExecution(
  strategyId: string,
  input: {
    maxTriggersPerDay: number | null;
    paperTrading: boolean;
    copiers: { accountId: string; multiplier: number; enabled: boolean }[];
  },
): Promise<ActionResult> {
  const { check } = await guard(strategyId, "edit_execute");
  if (!check.ok) return { error: check.error };

  if (input.maxTriggersPerDay !== null && input.maxTriggersPerDay <= 0) {
    return { error: "Max triggers/day must be a positive number, or blank for unlimited." };
  }
  if (input.copiers.some((c) => c.multiplier <= 0)) {
    return { error: "Copier multiplier must be greater than 0." };
  }

  await db
    .update(strategies)
    .set({ maxTriggersPerDay: input.maxTriggersPerDay, paperTrading: input.paperTrading, updatedAt: new Date() })
    .where(eq(strategies.id, strategyId));

  for (const copier of input.copiers) {
    await db
      .update(strategyAccounts)
      .set({ multiplier: copier.multiplier.toString(), enabled: copier.enabled })
      .where(and(eq(strategyAccounts.strategyId, strategyId), eq(strategyAccounts.accountId, copier.accountId)));
  }

  revalidatePath(STRATEGIES_PATH);
  return { success: true };
}

/** The triggers/day ring popover's own quick-save, separate from the full
 * Execution modal so the popover doesn't need to open the whole dialog. */
export async function setMaxTriggersPerDay(
  strategyId: string,
  value: number | null,
): Promise<ActionResult> {
  const { check } = await guard(strategyId, "edit_execute");
  if (!check.ok) return { error: check.error };
  if (value !== null && value <= 0) return { error: "Must be a positive number, or blank for unlimited." };

  await db
    .update(strategies)
    .set({ maxTriggersPerDay: value, updatedAt: new Date() })
    .where(eq(strategies.id, strategyId));

  revalidatePath(STRATEGIES_PATH);
  return { success: true };
}

export async function toggleSignalsHidden(strategyId: string): Promise<ActionResult> {
  const { check } = await guard(strategyId, "edit_execute");
  if (!check.ok) return { error: check.error };

  const [row] = await db
    .select({ signalsHidden: strategies.signalsHidden })
    .from(strategies)
    .where(eq(strategies.id, strategyId))
    .limit(1);
  if (!row) return { error: "Strategy not found." };

  await db
    .update(strategies)
    .set({ signalsHidden: !row.signalsHidden, updatedAt: new Date() })
    .where(eq(strategies.id, strategyId));

  revalidatePath(STRATEGIES_PATH);
  return { success: true };
}

export async function updateStrategyNotifications(
  strategyId: string,
  prefs: { event: NotificationEvent; email: boolean; telegram: boolean; push: boolean; telegramConnectionIds: string[] }[],
): Promise<ActionResult> {
  const { check } = await guard(strategyId, "edit_execute");
  if (!check.ok) return { error: check.error };

  await db.transaction(async (tx) => {
    for (const pref of prefs) {
      await tx
        .insert(strategyNotificationPrefs)
        .values({ strategyId, event: pref.event, email: pref.email, telegram: pref.telegram, push: pref.push })
        .onConflictDoUpdate({
          target: [strategyNotificationPrefs.strategyId, strategyNotificationPrefs.event],
          set: { email: pref.email, telegram: pref.telegram, push: pref.push },
        });

      await tx
        .delete(strategyNotificationChannels)
        .where(
          and(
            eq(strategyNotificationChannels.strategyId, strategyId),
            eq(strategyNotificationChannels.event, pref.event),
          ),
        );
      if (pref.telegramConnectionIds.length > 0) {
        await tx.insert(strategyNotificationChannels).values(
          pref.telegramConnectionIds.map((telegramConnectionId) => ({
            strategyId,
            event: pref.event,
            telegramConnectionId,
          })),
        );
      }
    }
  });

  revalidatePath(STRATEGIES_PATH);
  return { success: true };
}

export async function updateStrategyParameters(
  strategyId: string,
  input: { coolDownPeriod: number | null; config: Record<string, string> },
): Promise<ActionResult> {
  const { check } = await guard(strategyId, "edit_execute");
  if (!check.ok) return { error: check.error };
  if (input.coolDownPeriod !== null && input.coolDownPeriod < 0) {
    return { error: "Cooldown must be a non-negative number of seconds." };
  }

  await db
    .update(strategies)
    .set({ coolDownPeriod: input.coolDownPeriod, config: input.config, updatedAt: new Date() })
    .where(eq(strategies.id, strategyId));

  revalidatePath(STRATEGIES_PATH);
  return { success: true };
}

export async function updateStrategyChart(
  strategyId: string,
  input: { chartSymbol: string | null; chartInterval: string | null },
): Promise<ActionResult> {
  const { check } = await guard(strategyId, "edit_execute");
  if (!check.ok) return { error: check.error };

  await db
    .update(strategies)
    .set({ chartSymbol: input.chartSymbol, chartInterval: input.chartInterval, updatedAt: new Date() })
    .where(eq(strategies.id, strategyId));

  revalidatePath(STRATEGIES_PATH);
  return { success: true };
}

export async function shareStrategy(
  strategyId: string,
  targetUserId: string,
  permission: "none" | "view" | "view_execute" | "edit_execute" | "co_owner",
): Promise<ActionResult> {
  const { workspace, session, check } = await guard(strategyId, "co_owner");
  if (!check.ok) return { error: check.error };

  const [strategy] = await db
    .select({ name: strategies.name })
    .from(strategies)
    .where(eq(strategies.id, strategyId))
    .limit(1);

  if (permission === "none") {
    await db
      .delete(strategyAccess)
      .where(and(eq(strategyAccess.strategyId, strategyId), eq(strategyAccess.userId, targetUserId)));
  } else {
    await db
      .insert(strategyAccess)
      .values({ strategyId, userId: targetUserId, permission, grantedBy: session.user.id })
      .onConflictDoUpdate({
        target: [strategyAccess.strategyId, strategyAccess.userId],
        set: { permission, grantedBy: session.user.id, grantedAt: new Date() },
      });
  }

  await logAudit({
    workspaceId: workspace.id,
    actorId: session.user.id,
    action: "strategy.shared",
    summary:
      permission === "none"
        ? `Revoked access to strategy "${strategy?.name ?? strategyId}"`
        : `Set strategy "${strategy?.name ?? strategyId}" access to "${permission}"`,
  });

  revalidatePath(STRATEGIES_PATH);
  return { success: true };
}

/** Workspace members eligible to be granted strategy access, with their
 * current permission level on this specific strategy (if any). Powers the
 * Share modal's member list — a server action (not a plain query) since it
 * needs the request's own headers for auth.api.listMembers. */
export async function getShareableMembers(strategyId: string): Promise<ShareEntry[]> {
  const { workspace } = await requireActiveWorkspace();
  const headerList = await headers();

  const { members } = await auth.api.listMembers({
    headers: headerList,
    query: { organizationId: workspace.id },
  });
  if (members.length === 0) return [];

  const accessRows = await db
    .select({ userId: strategyAccess.userId, permission: strategyAccess.permission })
    .from(strategyAccess)
    .where(
      and(
        eq(strategyAccess.strategyId, strategyId),
        inArray(
          strategyAccess.userId,
          members.map((m) => m.userId),
        ),
      ),
    );
  const accessMap = new Map(accessRows.map((r) => [r.userId, r.permission]));

  return members.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    permission: accessMap.get(m.userId) ?? "none",
  }));
}

/** Telegram channels available to select in the Notifications modal. */
export async function getWorkspaceTelegramChannels() {
  const { workspace } = await requireActiveWorkspace();
  return db
    .select({ id: telegramConnections.id, label: telegramConnections.label })
    .from(telegramConnections)
    .where(and(eq(telegramConnections.workspaceId, workspace.id), eq(telegramConnections.active, true)));
}

/**
 * The Entry / Exit / SL-Target kill switches on the expanded row. Each one
 * only gates inbound *signals* (see lib/strategies/action-gates.ts) — a
 * strategy with Exit off still exits on its own stop-loss, target, trailing
 * rules, and manual closes.
 */
export async function updateStrategyActions(
  strategyId: string,
  input: { allowEntry: boolean; allowExit: boolean; allowModify: boolean },
): Promise<ActionResult> {
  const { workspace, session, check } = await guard(strategyId, "edit_execute");
  if (!check.ok) return { error: check.error };

  const [strategy] = await db
    .select({ name: strategies.name, allowEntry: strategies.allowEntry, allowExit: strategies.allowExit, allowModify: strategies.allowModify })
    .from(strategies)
    .where(and(eq(strategies.id, strategyId), eq(strategies.workspaceId, workspace.id)))
    .limit(1);
  if (!strategy) return { error: "Strategy not found." };

  await db
    .update(strategies)
    .set({
      allowEntry: input.allowEntry,
      allowExit: input.allowExit,
      allowModify: input.allowModify,
      updatedAt: new Date(),
    })
    .where(eq(strategies.id, strategyId));

  // Turning an action off silently stops trades the owner may still expect —
  // worth an audit line, same as pausing the strategy.
  const changed: string[] = [];
  if (strategy.allowEntry !== input.allowEntry) changed.push(`Entry ${input.allowEntry ? "on" : "off"}`);
  if (strategy.allowExit !== input.allowExit) changed.push(`Exit ${input.allowExit ? "on" : "off"}`);
  if (strategy.allowModify !== input.allowModify) changed.push(`SL/Target ${input.allowModify ? "on" : "off"}`);
  if (changed.length > 0) {
    await logAudit({
      workspaceId: workspace.id,
      actorId: session.user.id,
      action: "strategy.actions_changed",
      summary: `Strategy "${strategy.name}": ${changed.join(", ")}`,
    });
  }

  revalidatePath(STRATEGIES_PATH);
  return { success: true };
}

/**
 * The webhook secret is a credential the owner pastes into their TradingView
 * alert, so it's readable back — but only at edit_execute, never at plain
 * "view" like the rest of the strategy detail.
 */
export async function fetchWebhookSecret(strategyId: string): Promise<{ secret: string | null; canManage: boolean }> {
  const { workspace, check } = await guard(strategyId, "edit_execute");
  if (!check.ok) return { secret: null, canManage: false };

  const [row] = await db
    .select({ webhookSecret: strategies.webhookSecret })
    .from(strategies)
    .where(and(eq(strategies.id, strategyId), eq(strategies.workspaceId, workspace.id)))
    .limit(1);
  return { secret: row?.webhookSecret ?? null, canManage: true };
}

/** Generates (or rotates) the strategy's webhook secret and returns the new
 * value — the only moment it's handed back other than fetchWebhookSecret. */
export async function rotateWebhookSecret(strategyId: string): Promise<{ secret?: string; error?: string }> {
  const { workspace, session, check } = await guard(strategyId, "edit_execute");
  if (!check.ok) return { error: check.error };

  const [strategy] = await db
    .select({ name: strategies.name, webhookSecret: strategies.webhookSecret })
    .from(strategies)
    .where(and(eq(strategies.id, strategyId), eq(strategies.workspaceId, workspace.id)))
    .limit(1);
  if (!strategy) return { error: "Strategy not found." };

  const secret = generateWebhookSecret();

  await db.update(strategies).set({ webhookSecret: secret, updatedAt: new Date() }).where(eq(strategies.id, strategyId));

  await logAudit({
    workspaceId: workspace.id,
    actorId: session.user.id,
    action: "strategy.webhook_secret_rotated",
    summary: `${strategy.webhookSecret ? "Rotated" : "Generated"} webhook secret for strategy "${strategy.name}"`,
  });

  revalidatePath(STRATEGIES_PATH);
  return { secret };
}
