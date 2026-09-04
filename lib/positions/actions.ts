"use server";

import { eq, and, inArray, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { tradingSettings, positions, brokerAccounts, positionExecutions, positionNotes, user } from "@/db/schema";
import { requireActiveWorkspace } from "@/lib/auth/session";
import { hasWorkspacePermission } from "@/lib/auth/permissions";
import { getRunner } from "@/lib/runners";
import { logAudit } from "@/lib/audit/log";
import type { Market } from "@/db/schema";

export type ExecutionRow = {
  id: string;
  externalOrderId: string | null;
  occurredAt: Date;
  type: "bought" | "sold";
  side: "long" | "short";
  quantity: number;
  price: number;
  fee: number;
};

export type NoteRow = { id: string; authorName: string; body: string; createdAt: Date };

/** Verifies the position belongs to the caller's workspace before returning
 * anything scoped to it — same guard every position sub-resource needs. */
async function assertOwnsPosition(positionId: string, workspaceId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: positions.id })
    .from(positions)
    .where(and(eq(positions.id, positionId), eq(positions.workspaceId, workspaceId)))
    .limit(1);
  return Boolean(row);
}

export async function getPositionExecutions(positionId: string): Promise<ExecutionRow[]> {
  const { workspace, role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { trading: ["view"] })) return [];
  if (!(await assertOwnsPosition(positionId, workspace.id))) return [];

  const rows = await db
    .select()
    .from(positionExecutions)
    .where(eq(positionExecutions.positionId, positionId))
    .orderBy(positionExecutions.occurredAt);

  return rows.map((r) => ({
    id: r.id,
    externalOrderId: r.externalOrderId,
    occurredAt: r.occurredAt,
    type: r.type,
    side: r.side,
    quantity: Number(r.quantity),
    price: Number(r.price),
    fee: r.fee ? Number(r.fee) : 0,
  }));
}

export async function getPositionNotes(positionId: string): Promise<NoteRow[]> {
  const { workspace, role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { trading: ["view"] })) return [];
  if (!(await assertOwnsPosition(positionId, workspace.id))) return [];

  const rows = await db
    .select({ id: positionNotes.id, body: positionNotes.body, createdAt: positionNotes.createdAt, authorName: user.name })
    .from(positionNotes)
    .innerJoin(user, eq(positionNotes.authorId, user.id))
    .where(eq(positionNotes.positionId, positionId))
    .orderBy(desc(positionNotes.createdAt));

  return rows;
}

export async function addPositionNote(positionId: string, body: string): Promise<{ error?: string }> {
  const { workspace, session, role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { trading: ["view"] })) return { error: "You don't have permission to view this position." };
  if (!(await assertOwnsPosition(positionId, workspace.id))) return { error: "Position not found." };
  if (!body.trim()) return { error: "Note can't be empty." };

  await db.insert(positionNotes).values({
    id: crypto.randomUUID(),
    positionId,
    authorId: session.user.id,
    body: body.trim(),
  });

  revalidatePath("/dashboard/monarch/forex");
  revalidatePath("/dashboard/monarch/indian-options");
  revalidatePath("/dashboard/monarch/indian-equity");
  return {};
}

export type TradingSettingsData = {
  maxRiskPct: string;
  maxRiskPips: string | null;
  stopLossType: "PERCENTAGE" | "PIPS" | "PRICE";
  riskRewardRatio: string;
  partialBookingR: string;
  availableCapital: string | null;
  sizingMethod: "FIXED_PERCENTAGE" | "FIXED_QUANTITY" | "FIXED_RISK_AMOUNT";
  maxConcurrentPositions: string | null;
  maxPositionsPerSymbol: string;
  dailyTradeLimit: string;
};

const DEFAULTS: TradingSettingsData = {
  maxRiskPct: "1",
  maxRiskPips: null,
  stopLossType: "PERCENTAGE",
  riskRewardRatio: "2",
  partialBookingR: "1",
  availableCapital: null,
  sizingMethod: "FIXED_PERCENTAGE",
  maxConcurrentPositions: null,
  maxPositionsPerSymbol: "1",
  dailyTradeLimit: "10",
};

export async function getTradingSettings(market: Market): Promise<TradingSettingsData> {
  const { workspace, role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { trading: ["view"] })) return DEFAULTS;

  const [row] = await db
    .select()
    .from(tradingSettings)
    .where(and(eq(tradingSettings.workspaceId, workspace.id), eq(tradingSettings.market, market)))
    .limit(1);

  if (!row) return DEFAULTS;

  return {
    maxRiskPct: row.maxRiskPct ?? DEFAULTS.maxRiskPct,
    maxRiskPips: row.maxRiskPips,
    stopLossType: row.stopLossType,
    riskRewardRatio: row.riskRewardRatio ?? DEFAULTS.riskRewardRatio,
    partialBookingR: row.partialBookingR ?? DEFAULTS.partialBookingR,
    availableCapital: row.availableCapital,
    sizingMethod: row.sizingMethod,
    maxConcurrentPositions: row.maxConcurrentPositions,
    maxPositionsPerSymbol: row.maxPositionsPerSymbol ?? DEFAULTS.maxPositionsPerSymbol,
    dailyTradeLimit: row.dailyTradeLimit ?? DEFAULTS.dailyTradeLimit,
  };
}

export type SaveSettingsState = { error?: string; success?: boolean };

export async function saveTradingSettings(
  market: Market,
  _prev: SaveSettingsState,
  formData: FormData,
): Promise<SaveSettingsState> {
  const { workspace, role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { trading: ["execute"] })) {
    return { error: "You don't have permission to change trading settings." };
  }

  const str = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" && value !== "" ? value : null;
  };

  try {
    await db
      .insert(tradingSettings)
      .values({
        id: crypto.randomUUID(),
        workspaceId: workspace.id,
        market,
        maxRiskPct: str("maxRiskPct") ?? DEFAULTS.maxRiskPct,
        maxRiskPips: str("maxRiskPips"),
        stopLossType: (str("stopLossType") as TradingSettingsData["stopLossType"]) ?? "PERCENTAGE",
        riskRewardRatio: str("riskRewardRatio") ?? DEFAULTS.riskRewardRatio,
        partialBookingR: str("partialBookingR") ?? DEFAULTS.partialBookingR,
        availableCapital: str("availableCapital"),
        sizingMethod:
          (str("sizingMethod") as TradingSettingsData["sizingMethod"]) ?? "FIXED_PERCENTAGE",
        maxConcurrentPositions: str("maxConcurrentPositions"),
        maxPositionsPerSymbol: str("maxPositionsPerSymbol") ?? DEFAULTS.maxPositionsPerSymbol,
        dailyTradeLimit: str("dailyTradeLimit") ?? DEFAULTS.dailyTradeLimit,
      })
      .onConflictDoUpdate({
        target: [tradingSettings.workspaceId, tradingSettings.market],
        set: {
          maxRiskPct: str("maxRiskPct") ?? DEFAULTS.maxRiskPct,
          maxRiskPips: str("maxRiskPips"),
          stopLossType:
            (str("stopLossType") as TradingSettingsData["stopLossType"]) ?? "PERCENTAGE",
          riskRewardRatio: str("riskRewardRatio") ?? DEFAULTS.riskRewardRatio,
          partialBookingR: str("partialBookingR") ?? DEFAULTS.partialBookingR,
          availableCapital: str("availableCapital"),
          sizingMethod:
            (str("sizingMethod") as TradingSettingsData["sizingMethod"]) ?? "FIXED_PERCENTAGE",
          maxConcurrentPositions: str("maxConcurrentPositions"),
          maxPositionsPerSymbol: str("maxPositionsPerSymbol") ?? DEFAULTS.maxPositionsPerSymbol,
          dailyTradeLimit: str("dailyTradeLimit") ?? DEFAULTS.dailyTradeLimit,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save settings." };
  }

  revalidatePath(`/dashboard/monarch/${market.replace("_", "-")}`);
  return { success: true };
}

export type ClosePositionsResult = { closed: number; failed: string[] };

/**
 * Manual bulk close from the Active Positions panel. There's no live market
 * feed wired server-side and closePosition's ExecutionResult carries no fill
 * price (see lib/runners/types.ts), so — same rule as the strategy execution
 * engine — pnl/exitPrice are left null rather than guessed; the next broker
 * sync reconciles the real numbers once lib/runners/sync.ts pulls positions.
 */
export async function closePositions(ids: string[]): Promise<ClosePositionsResult> {
  const { workspace, session, role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { trading: ["execute"] })) {
    return { closed: 0, failed: ["You don't have permission to close positions."] };
  }
  if (ids.length === 0) return { closed: 0, failed: [] };

  const rows = await db
    .select({
      id: positions.id,
      accountId: positions.accountId,
      externalPositionId: positions.externalPositionId,
      market: positions.market,
      provider: brokerAccounts.provider,
    })
    .from(positions)
    .innerJoin(brokerAccounts, eq(positions.accountId, brokerAccounts.id))
    .where(
      and(
        inArray(positions.id, ids),
        eq(positions.workspaceId, workspace.id),
        eq(positions.status, "open"),
      ),
    );

  let closed = 0;
  const failed: string[] = [];
  const marketsTouched = new Set<Market>();

  for (const row of rows) {
    if (!row.externalPositionId) {
      failed.push(`${row.id}: no broker order id on record`);
      continue;
    }
    try {
      const runner = await getRunner(row.provider);
      const result = await runner.closePosition(row.accountId, row.externalPositionId);
      if (result.status === "executed") {
        await db
          .update(positions)
          .set({ status: "closed", closeReason: "manual_close", closedAt: new Date(), updatedAt: new Date() })
          .where(eq(positions.id, row.id));
        closed += 1;
        marketsTouched.add(row.market);
      } else {
        failed.push(`${row.id}: ${result.message}`);
      }
    } catch (error) {
      failed.push(`${row.id}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  for (const market of marketsTouched) {
    revalidatePath(`/dashboard/monarch/${market.replace("_", "-")}`);
  }

  if (closed > 0 || failed.length > 0) {
    await logAudit({
      workspaceId: workspace.id,
      actorId: session.user.id,
      action: "position.manual_close",
      summary: `Manually closed ${closed}/${rows.length} selected positions`,
      status: failed.length > 0 && closed === 0 ? "failure" : "success",
    });
  }

  return { closed, failed };
}
