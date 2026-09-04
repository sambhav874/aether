import { relations } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  numeric,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth-schema";
import { brokerAccounts } from "./broker-accounts";
import { strategies, signals } from "./strategies";
import { marketEnum, positionSideEnum, stopLossTypeEnum, positionSizingMethodEnum } from "./enums";

export { marketEnum, positionSideEnum, stopLossTypeEnum, positionSizingMethodEnum } from "./enums";
export type { Market } from "./enums";

export const positionStatusEnum = pgEnum("position_status", ["open", "closed"]);

export const positions = pgTable(
  "positions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => brokerAccounts.id, { onDelete: "cascade" }),
    market: marketEnum("market").notNull(),
    symbol: text("symbol").notNull(),
    side: positionSideEnum("side").notNull(),
    entryPrice: numeric("entry_price", { precision: 18, scale: 6 }).notNull(),
    exitPrice: numeric("exit_price", { precision: 18, scale: 6 }),
    quantity: numeric("quantity", { precision: 18, scale: 6 }).notNull(),
    filledQuantity: numeric("filled_quantity", { precision: 18, scale: 6 }),
    status: positionStatusEnum("status").notNull().default("open"),
    closeReason: text("close_reason"),
    pnl: numeric("pnl", { precision: 18, scale: 2 }),
    pnlPct: numeric("pnl_pct", { precision: 8, scale: 4 }),
    rr: numeric("rr", { precision: 8, scale: 4 }),
    sl: numeric("sl", { precision: 18, scale: 6 }),
    // Take-profit tracking, mirroring sl. Set by a MODIFY signal; informational
    // only — see lib/strategies/execute.ts for why it isn't pushed to the
    // broker as a live order yet.
    target: numeric("target", { precision: 18, scale: 6 }),
    // Carried over from the opening signal so later CLOSELONG/CLOSESHORT/
    // MODIFY signals with the same tag can target just this position.
    tag: text("tag"),
    // Free-form note from the opening signal's comment= field — metadata only.
    comment: text("comment"),
    strategyId: text("strategy_id").references(() => strategies.id, { onDelete: "set null" }),
    externalPositionId: text("external_position_id"),
    // True for a paper-traded fill (strategy paperTrading, or a per-signal
    // paper= override) — never sent to the broker. Every P&L query must
    // filter on this explicitly; the default everywhere is to exclude paper
    // fills so they can never blend into real P&L.
    isPaper: boolean("is_paper").notNull().default(false),
    openedAt: timestamp("opened_at").notNull(),
    closedAt: timestamp("closed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("positions_workspace_market_closed_idx").on(
      table.workspaceId,
      table.market,
      table.closedAt,
    ),
    index("positions_account_idx").on(table.accountId),
    uniqueIndex("positions_account_external_uidx").on(
      table.accountId,
      table.externalPositionId,
    ),
    index("positions_strategy_account_symbol_idx").on(
      table.strategyId,
      table.accountId,
      table.symbol,
      table.status,
    ),
  ],
);

export const baskets = pgTable(
  "baskets",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    note: text("note"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("baskets_workspace_idx").on(table.workspaceId)],
);

export const basketPositions = pgTable(
  "basket_positions",
  {
    basketId: text("basket_id")
      .notNull()
      .references(() => baskets.id, { onDelete: "cascade" }),
    positionId: text("position_id")
      .notNull()
      .references(() => positions.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("basket_positions_uidx").on(table.basketId, table.positionId),
    index("basket_positions_position_idx").on(table.positionId),
  ],
);

export const pendingLimitOrderStatusEnum = pgEnum("pending_limit_order_status", [
  "pending",
  "filled",
  "cancelled",
  "expired",
]);

// Tracks a resting entry LIMIT order placed for the options entry-limit-price
// feature (price= on BUY/SELL for indian_options, Motilal only — see
// lib/strategies/execute.ts). No position exists yet while status is
// "pending"; the poll job (app/api/cron/poll-limit-orders/route.ts) either
// fills it into a real position or cancels it at the broker after ~60s.
export const pendingLimitOrders = pgTable(
  "pending_limit_orders",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    strategyId: text("strategy_id")
      .notNull()
      .references(() => strategies.id, { onDelete: "cascade" }),
    signalId: text("signal_id").references(() => signals.id, { onDelete: "set null" }),
    accountId: text("account_id")
      .notNull()
      .references(() => brokerAccounts.id, { onDelete: "cascade" }),
    market: marketEnum("market").notNull(),
    symbol: text("symbol").notNull(),
    side: positionSideEnum("side").notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 6 }).notNull(),
    limitPrice: numeric("limit_price", { precision: 18, scale: 6 }).notNull(),
    externalOrderId: text("external_order_id").notNull(),
    tag: text("tag"),
    riskPercent: numeric("risk_percent", { precision: 8, scale: 4 }),
    comment: text("comment"),
    // Not FKs to baskets.id/strategies since either can be a not-yet-created
    // basket name — resolved into a real basket_positions row only once the
    // order actually fills.
    basketId: text("basket_id"),
    basketName: text("basket_name"),
    status: pendingLimitOrderStatusEnum("status").notNull().default("pending"),
    resultMessage: text("result_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    deadlineAt: timestamp("deadline_at").notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => [
    index("pending_limit_orders_status_deadline_idx").on(table.status, table.deadlineAt),
    index("pending_limit_orders_account_idx").on(table.accountId),
  ],
);

export const tradingSettings = pgTable(
  "trading_settings",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    market: marketEnum("market").notNull(),
    maxRiskPct: numeric("max_risk_pct", { precision: 6, scale: 3 }).default("1"),
    maxRiskPips: numeric("max_risk_pips", { precision: 10, scale: 2 }),
    stopLossType: stopLossTypeEnum("stop_loss_type").notNull().default("PERCENTAGE"),
    riskRewardRatio: numeric("risk_reward_ratio", { precision: 6, scale: 2 }).default("2"),
    partialBookingR: numeric("partial_booking_r", { precision: 6, scale: 2 }).default("1"),
    availableCapital: numeric("available_capital", { precision: 18, scale: 2 }),
    sizingMethod: positionSizingMethodEnum("sizing_method")
      .notNull()
      .default("FIXED_PERCENTAGE"),
    maxConcurrentPositions: numeric("max_concurrent_positions", { precision: 6, scale: 0 }),
    maxPositionsPerSymbol: numeric("max_positions_per_symbol", { precision: 6, scale: 0 }).default(
      "1",
    ),
    dailyTradeLimit: numeric("daily_trade_limit", { precision: 6, scale: 0 }).default("10"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("trading_settings_workspace_market_uidx").on(table.workspaceId, table.market),
  ],
);

export const strategyRuleTypeEnum = pgEnum("strategy_rule_type", ["trailing", "partial"]);

// Per-POSITION firing record for strategy trailing/partial rules — a rule
// fires once per position it applies to, not once ever for the strategy.
// Lives here (not strategies.ts) purely to avoid a strategies<->positions
// import cycle: its only real FK is to positions.id, which is local to this
// file. ruleId has no FK since it can point at either strategy_partial_rules
// or strategy_trailing_rules depending on ruleType — see lib/strategies/rules.ts.
export const strategyRuleFires = pgTable(
  "strategy_rule_fires",
  {
    id: text("id").primaryKey(),
    positionId: text("position_id")
      .notNull()
      .references(() => positions.id, { onDelete: "cascade" }),
    ruleId: text("rule_id").notNull(),
    ruleType: strategyRuleTypeEnum("rule_type").notNull(),
    firedAt: timestamp("fired_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("strategy_rule_fires_uidx").on(table.positionId, table.ruleId)],
);

export const executionTypeEnum = pgEnum("execution_type", ["bought", "sold"]);

// Individual broker fills that make up a position's lifecycle — one BUY fill
// to open, one or more SELL fills to partially/fully close (or the reverse
// for a short). Populated by the broker sync cron and at dispatch time in
// lib/strategies/execute.ts. This is what the Forex module's expanded
// position row renders under "EXECUTIONS" — nothing equivalent existed
// before; positions only ever stored their net entry/exit, not each fill.
export const positionExecutions = pgTable(
  "position_executions",
  {
    id: text("id").primaryKey(),
    positionId: text("position_id")
      .notNull()
      .references(() => positions.id, { onDelete: "cascade" }),
    externalOrderId: text("external_order_id"),
    occurredAt: timestamp("occurred_at").notNull(),
    type: executionTypeEnum("type").notNull(),
    side: positionSideEnum("side").notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 6 }).notNull(),
    price: numeric("price", { precision: 18, scale: 6 }).notNull(),
    fee: numeric("fee", { precision: 18, scale: 6 }).default("0"),
    source: text("source"),
  },
  (table) => [index("position_executions_position_idx").on(table.positionId, table.occurredAt)],
);

// Free-text notes a user attaches to a position — the "Add note" row action
// in the Forex module's expanded position.
export const positionNotes = pgTable(
  "position_notes",
  {
    id: text("id").primaryKey(),
    positionId: text("position_id")
      .notNull()
      .references(() => positions.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("position_notes_position_idx").on(table.positionId, table.createdAt)],
);

export const positionExecutionsRelations = relations(positionExecutions, ({ one }) => ({
  position: one(positions, {
    fields: [positionExecutions.positionId],
    references: [positions.id],
  }),
}));

export const positionNotesRelations = relations(positionNotes, ({ one }) => ({
  position: one(positions, {
    fields: [positionNotes.positionId],
    references: [positions.id],
  }),
}));

export const positionsRelations = relations(positions, ({ one, many }) => ({
  workspace: one(organization, {
    fields: [positions.workspaceId],
    references: [organization.id],
  }),
  account: one(brokerAccounts, {
    fields: [positions.accountId],
    references: [brokerAccounts.id],
  }),
  strategy: one(strategies, {
    fields: [positions.strategyId],
    references: [strategies.id],
  }),
  basketPositions: many(basketPositions),
  executions: many(positionExecutions),
  notes: many(positionNotes),
}));

export const basketsRelations = relations(baskets, ({ many }) => ({
  basketPositions: many(basketPositions),
}));

export const basketPositionsRelations = relations(basketPositions, ({ one }) => ({
  basket: one(baskets, {
    fields: [basketPositions.basketId],
    references: [baskets.id],
  }),
  position: one(positions, {
    fields: [basketPositions.positionId],
    references: [positions.id],
  }),
}));
