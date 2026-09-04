import "server-only";
import { eq, and, gte } from "drizzle-orm";
import { db } from "@/db/client";
import {
  strategies,
  strategyAccounts,
  strategyRiskSettings,
  strategyTrailingRules,
  strategyPartialRules,
  strategyNotificationPrefs,
  strategyNotificationChannels,
  brokerAccounts,
  tradingSettings,
  signals,
} from "@/db/schema";
import { resolveStrategyPermission } from "@/lib/strategies/permissions";
import type { WorkspaceRole } from "@/lib/auth/permissions";
import type { StrategyDetail, StrategyRiskSettings, NotificationEvent } from "@/lib/strategies/types";

function num(v: string | number | null): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function getStrategyDetail(
  strategyId: string,
  workspaceId: string,
  userId: string,
  workspaceRole: WorkspaceRole,
): Promise<StrategyDetail | null> {
  const [strategy] = await db
    .select()
    .from(strategies)
    .where(and(eq(strategies.id, strategyId), eq(strategies.workspaceId, workspaceId)))
    .limit(1);
  if (!strategy) return null;

  const permission = await resolveStrategyPermission(userId, workspaceRole, strategyId);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [
    riskRow,
    workspaceDefaultRow,
    trailingRows,
    partialRows,
    prefRows,
    channelRows,
    copierRows,
    signalsToday,
  ] = await Promise.all([
    db
      .select()
      .from(strategyRiskSettings)
      .where(eq(strategyRiskSettings.strategyId, strategyId))
      .limit(1),
    db
      .select()
      .from(tradingSettings)
      .where(and(eq(tradingSettings.workspaceId, workspaceId), eq(tradingSettings.market, strategy.market)))
      .limit(1),
    db
      .select()
      .from(strategyTrailingRules)
      .where(eq(strategyTrailingRules.strategyId, strategyId))
      .orderBy(strategyTrailingRules.sortOrder),
    db
      .select()
      .from(strategyPartialRules)
      .where(eq(strategyPartialRules.strategyId, strategyId))
      .orderBy(strategyPartialRules.sortOrder),
    db
      .select()
      .from(strategyNotificationPrefs)
      .where(eq(strategyNotificationPrefs.strategyId, strategyId)),
    db
      .select()
      .from(strategyNotificationChannels)
      .where(eq(strategyNotificationChannels.strategyId, strategyId)),
    db
      .select({
        accountId: strategyAccounts.accountId,
        multiplier: strategyAccounts.multiplier,
        enabled: strategyAccounts.enabled,
        label: brokerAccounts.label,
        provider: brokerAccounts.provider,
      })
      .from(strategyAccounts)
      .innerJoin(brokerAccounts, eq(strategyAccounts.accountId, brokerAccounts.id))
      .where(eq(strategyAccounts.strategyId, strategyId)),
    // "used today" for the max-triggers-per-day popover — reuses
    // signals_strategy_received_idx via strategyId + receivedAt.
    db
      .select({ id: signals.id })
      .from(signals)
      .where(and(eq(signals.strategyId, strategyId), gte(signals.receivedAt, todayStart))),
  ]);

  const risk = riskRow[0];
  const wsDefault = workspaceDefaultRow[0];

  const riskSettings: StrategyRiskSettings | null = risk
    ? {
        sizingMethod: risk.sizingMethod,
        totalCapital: num(risk.totalCapital),
        availableCapital: num(risk.availableCapital),
        maxConcurrentPositions: num(risk.maxConcurrentPositions),
        maxPositionsPerSymbol: num(risk.maxPositionsPerSymbol),
        dailyTradeLimit: num(risk.dailyTradeLimit),
        allowMultipleSameSide: risk.allowMultipleSameSide,
        maxRiskPct: num(risk.maxRiskPct),
        maxRiskPips: num(risk.maxRiskPips),
        stopLossType: risk.stopLossType,
        defaultStopLossPct: num(risk.defaultStopLossPct),
        riskRewardRatio: num(risk.riskRewardRatio),
        partialBookingR: num(risk.partialBookingR),
      }
    : null;

  const workspaceDefaults: StrategyRiskSettings | null = wsDefault
    ? {
        sizingMethod: wsDefault.sizingMethod,
        totalCapital: null,
        availableCapital: num(wsDefault.availableCapital),
        maxConcurrentPositions: num(wsDefault.maxConcurrentPositions),
        maxPositionsPerSymbol: num(wsDefault.maxPositionsPerSymbol),
        dailyTradeLimit: num(wsDefault.dailyTradeLimit),
        allowMultipleSameSide: false,
        maxRiskPct: num(wsDefault.maxRiskPct),
        maxRiskPips: num(wsDefault.maxRiskPips),
        stopLossType: wsDefault.stopLossType,
        defaultStopLossPct: null,
        riskRewardRatio: num(wsDefault.riskRewardRatio),
        partialBookingR: num(wsDefault.partialBookingR),
      }
    : null;

  const channelsByEvent = new Map<NotificationEvent, string[]>();
  for (const row of channelRows) {
    const list = channelsByEvent.get(row.event) ?? [];
    list.push(row.telegramConnectionId);
    channelsByEvent.set(row.event, list);
  }

  const events: NotificationEvent[] = ["entry", "partial", "exit"];
  const prefByEvent = new Map(prefRows.map((r) => [r.event, r]));
  const notifications = events.map((event) => {
    const pref = prefByEvent.get(event);
    return {
      event,
      email: pref?.email ?? false,
      telegram: pref?.telegram ?? false,
      push: pref?.push ?? false,
      telegramConnectionIds: channelsByEvent.get(event) ?? [],
    };
  });

  return {
    id: strategy.id,
    paperTrading: strategy.paperTrading,
    signalsHidden: strategy.signalsHidden,
    config: strategy.config ?? {},
    chartSymbol: strategy.chartSymbol,
    chartInterval: strategy.chartInterval,
    coolDownPeriod: strategy.coolDownPeriod,
    maxTriggersPerDay: strategy.maxTriggersPerDay,
    triggersUsedToday: signalsToday.length,
    riskSettings,
    workspaceDefaults,
    trailingRules: trailingRows.map((r) => ({
      id: r.id,
      rrLevel: Number(r.rrLevel),
      trailingType: r.trailingType,
      sortOrder: r.sortOrder,
    })),
    partialRules: partialRows.map((r) => ({
      id: r.id,
      rrLevel: Number(r.rrLevel),
      exitPct: Number(r.exitPct),
      sortOrder: r.sortOrder,
    })),
    notifications,
    copiers: copierRows.map((r) => ({
      accountId: r.accountId,
      label: r.label,
      provider: r.provider,
      multiplier: Number(r.multiplier),
      enabled: r.enabled,
    })),
    permission,
  };
}
