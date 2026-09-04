import type { Market } from "@/db/schema";
import type { SignalAction } from "@/lib/webhooks/parse-signal-message";

export type StrategyRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  market: Market;
  handleType: "AUTO" | "MANUAL" | "BY_STRATEGY";
  defaultSymbol: string | null;
  status: "active" | "paused";
  signalsLast24h: number;
  lastTriggeredAt: Date | null;
  sparkline: { date: string; count: number }[];
  linkedAccountIds: string[];
  createdAt: Date;
  coolDownPeriod: number | null;
  maxTriggersPerDay: number | null;
  isGlobal: boolean;
  /** Per-action kill switches — see lib/strategies/action-gates.ts. */
  allowEntry: boolean;
  allowExit: boolean;
  allowModify: boolean;
  /** Whether a webhook secret is configured. The value itself never rides
   * along with the list — it's fetched on demand, gated at edit_execute. */
  hasWebhookSecret: boolean;
  /** Signals received today (UTC calendar day), regardless of outcome. */
  triggersToday: number;
  /** 24 hourly buckets, oldest (24h ago) to newest (current hour). */
  signalHistory: { long: number; short: number; total: number }[];
};

export type CopierAccount = {
  accountId: string;
  label: string;
  provider: string;
  multiplier: number;
  enabled: boolean;
};

export type StrategyRiskSettings = {
  sizingMethod: "FIXED_PERCENTAGE" | "FIXED_QUANTITY" | "FIXED_RISK_AMOUNT" | null;
  totalCapital: number | null;
  availableCapital: number | null;
  maxConcurrentPositions: number | null;
  maxPositionsPerSymbol: number | null;
  dailyTradeLimit: number | null;
  allowMultipleSameSide: boolean;
  maxRiskPct: number | null;
  maxRiskPips: number | null;
  stopLossType: "PERCENTAGE" | "PIPS" | "PRICE" | null;
  defaultStopLossPct: number | null;
  riskRewardRatio: number | null;
  partialBookingR: number | null;
};

export type TrailingRuleRow = {
  id: string;
  rrLevel: number;
  trailingType: "EMA" | "ATR" | "LAST_4_CANDLES" | "LAST_CANDLE";
  sortOrder: number;
};

export type PartialRuleRow = {
  id: string;
  rrLevel: number;
  exitPct: number;
  sortOrder: number;
};

export type NotificationEvent = "entry" | "partial" | "exit";

export type NotificationPrefRow = {
  event: NotificationEvent;
  email: boolean;
  telegram: boolean;
  push: boolean;
  telegramConnectionIds: string[];
};

export type ShareEntry = {
  userId: string;
  name: string;
  email: string;
  permission: "none" | "view" | "view_execute" | "edit_execute" | "co_owner";
};

export type StrategyDetail = {
  id: string;
  paperTrading: boolean;
  signalsHidden: boolean;
  config: Record<string, string>;
  chartSymbol: string | null;
  chartInterval: string | null;
  coolDownPeriod: number | null;
  maxTriggersPerDay: number | null;
  triggersUsedToday: number;
  riskSettings: StrategyRiskSettings | null;
  workspaceDefaults: StrategyRiskSettings | null;
  trailingRules: TrailingRuleRow[];
  partialRules: PartialRuleRow[];
  notifications: NotificationPrefRow[];
  copiers: CopierAccount[];
  permission: "none" | "view" | "view_execute" | "edit_execute" | "co_owner";
};

export type SignalRow = {
  id: string;
  source: "tradingview" | "webhook";
  action: SignalAction;
  side: "long" | "short" | null;
  symbol: string;
  tag: string | null;
  sl: string | null;
  target: string | null;
  status: "received" | "rejected" | "pending_confirmation";
  resultMessage: string | null;
  receivedAt: Date;
};
