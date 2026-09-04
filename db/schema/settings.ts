import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organization, user } from "./auth-schema";

// Storage only — no delivery infra yet (email/Telegram is a separate,
// vendor-gated build). This just persists what a user WANTS to be notified
// about, so the UI has something real to read from and later wiring has
// something real to check against.
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    signalAlerts: boolean("signal_alerts").default(true).notNull(),
    brokerDisconnected: boolean("broker_disconnected").default(true).notNull(),
    strategyPaused: boolean("strategy_paused").default(true).notNull(),
    securityAlerts: boolean("security_alerts").default(true).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("notification_preferences_workspace_user_uidx").on(table.workspaceId, table.userId)],
);

// A shared, workspace-level delivery channel — mirrors broker_accounts, not
// notification_preferences (which is per-user "what do I want to hear
// about"). Any active connection gets every enabled category for the
// workspace; there's no per-connection category filter yet.
export const telegramConnections = pgTable(
  "telegram_connections",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    chatId: text("chat_id").notNull(),
    label: text("label").notNull(),
    active: boolean("active").default(true).notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("telegram_connections_workspace_chat_uidx").on(table.workspaceId, table.chatId),
    index("telegram_connections_workspace_idx").on(table.workspaceId),
  ],
);

export const telegramConnectionsRelations = relations(telegramConnections, ({ one }) => ({
  workspace: one(organization, {
    fields: [telegramConnections.workspaceId],
    references: [organization.id],
  }),
}));

export const auditLogStatusEnum = ["success", "failure"] as const;

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    status: text("status", { enum: auditLogStatusEnum }).default("success").notNull(),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  },
  (table) => [index("audit_log_workspace_occurred_idx").on(table.workspaceId, table.occurredAt)],
);

export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  workspace: one(organization, {
    fields: [notificationPreferences.workspaceId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [notificationPreferences.userId],
    references: [user.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  workspace: one(organization, {
    fields: [auditLog.workspaceId],
    references: [organization.id],
  }),
  actor: one(user, {
    fields: [auditLog.actorId],
    references: [user.id],
  }),
}));
