import { relations } from "drizzle-orm";
import { pgTable, pgEnum, text, timestamp, numeric, integer, boolean, uniqueIndex, index, jsonb } from "drizzle-orm/pg-core";
import { organization, user } from "./auth-schema";
import { marketEnum, positionSideEnum, stopLossTypeEnum, positionSizingMethodEnum } from "./enums";
import { brokerAccounts } from "./broker-accounts";
import { telegramConnections } from "./settings";

export const strategyStatusEnum = pgEnum("strategy_status", ["active", "paused"]);

// AUTO: signals dispatch immediately, SL calculated from risk% of entry price.
// MANUAL: signals are stored as pending_confirmation and wait for a human.
// BY_STRATEGY: dispatches immediately, no SL calculation — the strategy
// itself is assumed to own exit logic entirely.
export const strategyHandleTypeEnum = pgEnum("strategy_handle_type", [
  "AUTO",
  "MANUAL",
  "BY_STRATEGY",
]);

export const strategies = pgTable(
  "strategies",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Globally unique, not per-workspace: the webhook payload carries only a
    // slug (no workspace id), so lookup must be unambiguous across the whole
    // product — see the strategies_slug_uidx index below.
    slug: text("slug").notNull(),
    description: text("description"),
    market: marketEnum("market").notNull(),
    handleType: strategyHandleTypeEnum("handle_type").notNull().default("AUTO"),
    defaultSymbol: text("default_symbol"),
    status: strategyStatusEnum("status").notNull().default("active"),
    // Minimum seconds between accepted signals — null means no cooldown.
    coolDownPeriod: integer("cool_down_period"),
    // Max signals accepted per calendar day (UTC) — null means unlimited.
    maxTriggersPerDay: integer("max_triggers_per_day"),
    // UI/filter flag only — matches the reference product's own "system-wide
    // · disabled" framing. No cross-workspace visibility or execution is
    // wired to this; it doesn't do anything beyond being displayed/filtered.
    isGlobal: boolean("is_global").notNull().default(false),
    // When true (or overridden per-signal via paper=true), dispatchEntry
    // creates a positions row with isPaper=true and never calls the broker.
    // See "Entry Limit Price" in the webhook guide for the price= fallback
    // rule used when no live tick is available.
    paperTrading: boolean("paper_trading").notNull().default(false),
    // Per-action kill switches, mirroring the reference product's Entry /
    // Exit / SL-Target toggles. A signal whose action falls under a disabled
    // toggle is cancelled with a reason instead of dispatching — see
    // lib/strategies/action-gates.ts. Only inbound webhook signals (and the
    // manual-confirmation path that replays them) pass through that gate;
    // stop-loss, target and trailing exits run from their own cron paths and
    // are never gated here.
    allowEntry: boolean("allow_entry").notNull().default(true),
    allowExit: boolean("allow_exit").notNull().default(true),
    allowModify: boolean("allow_modify").notNull().default(true),
    // Optional shared secret for the webhook endpoints. Null (the default)
    // means slug-only auth, matching the reference product. When set, an
    // inbound signal must carry a matching `secret=` field or it is rejected
    // with the same uniform error an unknown slug gets. Stored in plaintext
    // because the owner has to paste it into their TradingView alert body;
    // it is redacted out of the signal's stored raw payload.
    webhookSecret: text("webhook_secret"),
    // "Hide signals" menu item — collapses the Signals tab in the expanded
    // row without deleting any signal history.
    signalsHidden: boolean("signals_hidden").notNull().default(false),
    // Arbitrary key/value fields from the Parameters modal (cooldown is its
    // own column above; this is everything else the user adds ad hoc).
    config: jsonb("config").$type<Record<string, string>>(),
    chartSymbol: text("chart_symbol"),
    chartInterval: text("chart_interval"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("strategies_slug_uidx").on(table.slug)],
);

export const signalSourceEnum = pgEnum("signal_source", ["tradingview", "webhook"]);
export const signalActionEnum = pgEnum("signal_action", [
  "BUY",
  "SELL",
  "CLOSELONG",
  "CLOSESHORT",
  "MODIFY",
  "CLOSELONGPARTIAL",
  "CLOSESHORTPARTIAL",
  "CLOSESHORTBUY",
  "CLOSELONGSELL",
  "CLOSESHORTSELL",
  "CLOSELONGBUY",
]);
export const signalValueTypeEnum = pgEnum("signal_value_type", ["PRICE", "POINTS", "PERCENTAGE"]);
export const signalStatusEnum = pgEnum("signal_status", [
  "received",
  "rejected",
  "pending_confirmation",
]);

// Ingested from the webhook endpoint, then matched against strategy_accounts
// and dispatched by lib/strategies/execute.ts.
export const signals = pgTable(
  "signals",
  {
    id: text("id").primaryKey(),
    strategyId: text("strategy_id")
      .notNull()
      .references(() => strategies.id, { onDelete: "cascade" }),
    source: signalSourceEnum("source").notNull(),
    action: signalActionEnum("action").notNull(),
    // Effective side: derived from action for BUY/SELL/CLOSELONG/CLOSESHORT,
    // explicit-or-default("long") for MODIFY.
    side: positionSideEnum("side"),
    symbol: text("symbol").notNull(),
    market: marketEnum("market").notNull(),
    // Reserved for the deferred options-entry limit-price feature; unused by
    // the core BUY/SELL/CLOSE/MODIFY path.
    price: numeric("price", { precision: 18, scale: 6 }),
    sl: numeric("sl", { precision: 18, scale: 6 }),
    target: numeric("target", { precision: 18, scale: 6 }),
    valueType: signalValueTypeEnum("value_type"),
    // Scopes CLOSELONG/CLOSESHORT/MODIFY to positions opened with the same
    // tag; null means "all matching positions regardless of tag".
    tag: text("tag"),
    // Position size for a BUY/SELL signal. The strategy itself is the only
    // thing that knows how big a position it wants — TradingView alerts can
    // send this directly (e.g. {{strategy.order.contracts}}). Automatic
    // sizing from trading_settings isn't implemented: FIXED_QUANTITY has no
    // configured amount and FIXED_PERCENTAGE/FIXED_RISK_AMOUNT would need
    // per-instrument pip/contract value data we don't have — inventing that
    // math would risk silently mis-sizing a real order.
    quantity: numeric("quantity", { precision: 18, scale: 6 }),
    status: signalStatusEnum("status").notNull().default("received"),
    resultMessage: text("result_message"),
    // Catch-all for fields not yet promoted to their own column (risk,
    // percent, comment, basketId, basketName, paper, ...) — keeps the
    // deferred partial-close/basket/paper-mode follow-up from needing its
    // own migration for every new field.
    parsedFields: jsonb("parsed_fields").$type<Record<string, string>>(),
    rawPayload: text("raw_payload").notNull(),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
  },
  (table) => [
    index("signals_strategy_received_idx").on(table.strategyId, table.receivedAt),
  ],
);

// Which broker accounts a strategy's signals get dispatched to. Many-to-many
// since one strategy can fan out to several accounts (and in principle one
// account could back-test more than one strategy).
export const strategyAccounts = pgTable(
  "strategy_accounts",
  {
    strategyId: text("strategy_id")
      .notNull()
      .references(() => strategies.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => brokerAccounts.id, { onDelete: "cascade" }),
    // Scales this account's order size against what the strategy calculated
    // — 1 = same size, 0.5 = half, 2 = double. The Execution modal's copier
    // list ("×1" per account).
    multiplier: numeric("multiplier", { precision: 8, scale: 4 }).notNull().default("1"),
    // Lets a copier be paused without unlinking it (and losing its
    // multiplier setting).
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("strategy_accounts_uidx").on(table.strategyId, table.accountId),
    index("strategy_accounts_account_idx").on(table.accountId),
  ],
);

// Ladder, low to high. "No access" is the absence of a strategy_access row,
// not a value here — see strategyAccess below.
export const strategyPermissionEnum = pgEnum("strategy_permission", [
  "view",
  "view_execute",
  "edit_execute",
  "co_owner",
]);

// Per-strategy ACL, independent of workspace role — lets an Owner/co-owner
// grant one member view/execute/edit rights on a specific strategy without
// touching their workspace-wide role. A user with no row here (and no
// workspace-level grant) has no access at all — see lib/strategies/permissions.ts
// for how the two layers combine. Granted from the strategy's Share modal.
export const strategyAccess = pgTable(
  "strategy_access",
  {
    strategyId: text("strategy_id")
      .notNull()
      .references(() => strategies.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    permission: strategyPermissionEnum("permission").notNull().default("view"),
    grantedBy: text("granted_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("strategy_access_uidx").on(table.strategyId, table.userId)],
);

// Per-strategy override of the workspace-level trading_settings row (same
// shape, see db/schema/positions.ts). A null/missing row here means the
// strategy inherits the workspace's market-level settings — the Risk & exits
// modal shows inherited values grayed out with an "inherited" hint.
export const strategyRiskSettings = pgTable("strategy_risk_settings", {
  strategyId: text("strategy_id")
    .primaryKey()
    .references(() => strategies.id, { onDelete: "cascade" }),
  sizingMethod: positionSizingMethodEnum("sizing_method"),
  totalCapital: numeric("total_capital", { precision: 18, scale: 2 }),
  availableCapital: numeric("available_capital", { precision: 18, scale: 2 }),
  maxConcurrentPositions: numeric("max_concurrent_positions", { precision: 6, scale: 0 }),
  maxPositionsPerSymbol: numeric("max_positions_per_symbol", { precision: 6, scale: 0 }),
  dailyTradeLimit: numeric("daily_trade_limit", { precision: 6, scale: 0 }),
  // Disabled by default (matches trading_settings' own real-world behavior)
  // — only one BUY and one SELL can be active per symbol unless turned on.
  allowMultipleSameSide: boolean("allow_multiple_same_side").notNull().default(false),
  maxRiskPct: numeric("max_risk_pct", { precision: 6, scale: 3 }),
  maxRiskPips: numeric("max_risk_pips", { precision: 10, scale: 2 }),
  stopLossType: stopLossTypeEnum("stop_loss_type"),
  defaultStopLossPct: numeric("default_stop_loss_pct", { precision: 6, scale: 3 }),
  riskRewardRatio: numeric("risk_reward_ratio", { precision: 6, scale: 2 }),
  partialBookingR: numeric("partial_booking_r", { precision: 6, scale: 2 }),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const trailingTypeEnum = pgEnum("trailing_type", ["EMA", "ATR", "LAST_4_CANDLES", "LAST_CANDLE"]);

// Repeatable trailing-stop rules from the Risk & exits > Exit Rules tab —
// "at R:R level N, trail using type T". Evaluated by the broker sync cron
// against each open position's live R (see lib/strategies/execute.ts).
export const strategyTrailingRules = pgTable(
  "strategy_trailing_rules",
  {
    id: text("id").primaryKey(),
    strategyId: text("strategy_id")
      .notNull()
      .references(() => strategies.id, { onDelete: "cascade" }),
    rrLevel: numeric("rr_level", { precision: 6, scale: 2 }).notNull(),
    trailingType: trailingTypeEnum("trailing_type").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("strategy_trailing_rules_strategy_idx").on(table.strategyId, table.sortOrder)],
);

// Repeatable partial-booking rules — "at R:R level N, book X% of the
// position". Server-validated so the sum of exitPct across a strategy's
// rules never exceeds 100.
export const strategyPartialRules = pgTable(
  "strategy_partial_rules",
  {
    id: text("id").primaryKey(),
    strategyId: text("strategy_id")
      .notNull()
      .references(() => strategies.id, { onDelete: "cascade" }),
    rrLevel: numeric("rr_level", { precision: 6, scale: 2 }).notNull(),
    exitPct: numeric("exit_pct", { precision: 5, scale: 2 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("strategy_partial_rules_strategy_idx").on(table.strategyId, table.sortOrder)],
);

export const strategyNotificationEventEnum = pgEnum("strategy_notification_event", [
  "entry",
  "partial",
  "exit",
]);

// Per-strategy, per-event channel toggles (Notifications modal). Distinct
// from the workspace-level notification_preferences in db/schema/settings.ts,
// which is a per-user "what categories do I want to hear about" — this is
// "for this one strategy, which channels fire on which position event".
export const strategyNotificationPrefs = pgTable(
  "strategy_notification_prefs",
  {
    strategyId: text("strategy_id")
      .notNull()
      .references(() => strategies.id, { onDelete: "cascade" }),
    event: strategyNotificationEventEnum("event").notNull(),
    email: boolean("email").notNull().default(false),
    telegram: boolean("telegram").notNull().default(false),
    push: boolean("push").notNull().default(false),
  },
  (table) => [uniqueIndex("strategy_notification_prefs_uidx").on(table.strategyId, table.event)],
);

// Which specific telegram_connections a strategy's event notification goes
// to, when strategy_notification_prefs.telegram is on for that event —
// the Notifications modal's per-event "Telegram channels: Select channels".
export const strategyNotificationChannels = pgTable(
  "strategy_notification_channels",
  {
    strategyId: text("strategy_id")
      .notNull()
      .references(() => strategies.id, { onDelete: "cascade" }),
    event: strategyNotificationEventEnum("event").notNull(),
    telegramConnectionId: text("telegram_connection_id")
      .notNull()
      .references(() => telegramConnections.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("strategy_notification_channels_uidx").on(
      table.strategyId,
      table.event,
      table.telegramConnectionId,
    ),
  ],
);

export const strategiesRelations = relations(strategies, ({ one, many }) => ({
  workspace: one(organization, {
    fields: [strategies.workspaceId],
    references: [organization.id],
  }),
  signals: many(signals),
  strategyAccounts: many(strategyAccounts),
  strategyAccess: many(strategyAccess),
  riskSettings: one(strategyRiskSettings, {
    fields: [strategies.id],
    references: [strategyRiskSettings.strategyId],
  }),
  trailingRules: many(strategyTrailingRules),
  partialRules: many(strategyPartialRules),
}));

export const signalsRelations = relations(signals, ({ one }) => ({
  strategy: one(strategies, {
    fields: [signals.strategyId],
    references: [strategies.id],
  }),
}));

export const strategyAccountsRelations = relations(strategyAccounts, ({ one }) => ({
  strategy: one(strategies, {
    fields: [strategyAccounts.strategyId],
    references: [strategies.id],
  }),
  account: one(brokerAccounts, {
    fields: [strategyAccounts.accountId],
    references: [brokerAccounts.id],
  }),
}));

export const strategyAccessRelations = relations(strategyAccess, ({ one }) => ({
  strategy: one(strategies, {
    fields: [strategyAccess.strategyId],
    references: [strategies.id],
  }),
}));
