import { relations } from "drizzle-orm";
import { pgTable, pgEnum, text, timestamp, numeric, integer, jsonb, date, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organization, user } from "./auth-schema";

// Shared across ai_runs and ai_model_prefs — see PLAN_AI_COPILOT.md §4/§4.1.
// One call in the agent pipeline maps to exactly one of these.
export const aiLaneEnum = pgEnum("ai_lane", [
  "routing",
  "main_loop",
  "deep_synthesis",
  "sub_agent",
  "fallback",
]);

export const aiProviderEnum = pgEnum("ai_provider", ["groq", "openai", "google", "keiro"]);

export const aiMessageRoleEnum = pgEnum("ai_message_role", ["user", "assistant", "system"]);

export const aiRunStatusEnum = pgEnum("ai_run_status", ["ok", "error", "timeout"]);

// A copilot conversation. Not workspace-shared like strategies — each
// user's own thread list, scoped to the workspace they were in when they
// started it (matches how the ⌘K panel and the dedicated /copilot page
// both open: from a specific workspace context).
export const aiThreads = pgTable(
  "ai_threads",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title"),
    // Set when the thread was opened from a page with a symbol in context
    // (company research, indian-equity, forex) — see PLAN_AI_COPILOT.md §3
    // "Entry points". Null for threads opened from the dedicated page or ⌘K
    // with no page context.
    pinnedSymbol: text("pinned_symbol"),
    lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_threads_workspace_user_idx").on(table.workspaceId, table.userId),
    index("ai_threads_last_message_idx").on(table.userId, table.lastMessageAt),
  ],
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => aiThreads.id, { onDelete: "cascade" }),
    role: aiMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    // Ordered list of { name, args, result digest, latencyMs, status } —
    // the full tool-call trace for this turn, not just the final answer.
    toolCalls: jsonb("tool_calls").$type<
      { name: string; args: unknown; resultDigest: string; latencyMs: number; status: "ok" | "error" }[]
    >(),
    // The exact tool payloads the answer cites, keyed by a short id the
    // answer text references — what renders the evidence cards in the UI
    // and what the numeric-fidelity eval checks claims against.
    evidence: jsonb("evidence").$type<Record<string, unknown>>(),
    provider: aiProviderEnum("provider"),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("ai_messages_thread_created_idx").on(table.threadId, table.createdAt)],
);

// One row per LLM call anywhere in the AI layer, not just chat — the trace
// table both the copilot and the (deferred) webhook-verdict plan write to.
// Without this, cost and regression questions are unanswerable in a month.
export const aiRuns = pgTable(
  "ai_runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    lane: aiLaneEnum("lane").notNull(),
    provider: aiProviderEnum("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
    latencyMs: integer("latency_ms"),
    // Tool-loop steps taken this call — null for a single non-agentic call.
    steps: integer("steps"),
    status: aiRunStatusEnum("status").notNull(),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("ai_runs_workspace_created_idx").on(table.workspaceId, table.createdAt)],
);

// Small, inspectable, user-deletable facts the copilot has picked up about
// how this person trades — "prefers INR", "trades BANKNIFTY weeklies".
// Deliberately not a vector store: this is a short key/value list a user
// can read and prune, not a similarity-searched corpus.
export const aiUserMemorySourceEnum = pgEnum("ai_user_memory_source", ["inferred", "stated"]);

export const aiUserMemory = pgTable(
  "ai_user_memory",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    source: aiUserMemorySourceEnum("source").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("ai_user_memory_user_key_uidx").on(table.userId, table.key)],
);

// Per-user, per-lane model override — see PLAN_AI_COPILOT.md §4.1. A
// missing row for a given lane means "inherit the lib/ai/provider/models.ts
// default"; this table only holds the deviations from that default.
export const aiModelPrefs = pgTable(
  "ai_model_prefs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lane: aiLaneEnum("lane").notNull(),
    provider: aiProviderEnum("provider").notNull(),
    model: text("model").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("ai_model_prefs_user_lane_uidx").on(table.userId, table.lane)],
);

// Nightly-refreshed snapshot powering screen_stocks (PLAN_AI_COPILOT.md §2.1
// "Screening") — the one tool that can't hit Yahoo/NSE live per-symbol
// against a whole universe without getting rate-limited. Global, not
// workspace-scoped: the same instrument has the same fundamentals for
// everyone, refreshed once for the whole deployment.
export const instrumentFundamentals = pgTable(
  "instrument_fundamentals",
  {
    symbol: text("symbol").primaryKey(),
    exchange: text("exchange").notNull(),
    name: text("name").notNull(),
    sector: text("sector"),
    industry: text("industry"),
    marketCap: numeric("market_cap", { precision: 20, scale: 2 }),
    pe: numeric("pe", { precision: 12, scale: 4 }),
    pb: numeric("pb", { precision: 12, scale: 4 }),
    roe: numeric("roe", { precision: 8, scale: 4 }),
    revenueGrowth: numeric("revenue_growth", { precision: 8, scale: 4 }),
    profitMargin: numeric("profit_margin", { precision: 8, scale: 4 }),
    debtToEquity: numeric("debt_to_equity", { precision: 10, scale: 4 }),
    dividendYield: numeric("dividend_yield", { precision: 8, scale: 4 }),
    beta: numeric("beta", { precision: 8, scale: 4 }),
    ret1y: numeric("ret_1y", { precision: 10, scale: 4 }),
    refreshedAt: timestamp("refreshed_at").defaultNow().notNull(),
  },
  (table) => [index("instrument_fundamentals_sector_idx").on(table.sector), index("instrument_fundamentals_market_cap_idx").on(table.marketCap)],
);

// Daily cost rollup per workspace — the cap-enforcement source for the AI
// layer's spend limits. Written to incrementally as ai_runs land for that
// workspace/day, read on every call before dispatch.
export const aiUsageDaily = pgTable(
  "ai_usage_daily",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    costUsd: numeric("cost_usd", { precision: 10, scale: 4 }).notNull().default("0"),
    requests: integer("requests").notNull().default(0),
  },
  (table) => [uniqueIndex("ai_usage_daily_workspace_date_uidx").on(table.workspaceId, table.date)],
);

export const aiThreadsRelations = relations(aiThreads, ({ one, many }) => ({
  workspace: one(organization, {
    fields: [aiThreads.workspaceId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [aiThreads.userId],
    references: [user.id],
  }),
  messages: many(aiMessages),
}));

export const aiMessagesRelations = relations(aiMessages, ({ one }) => ({
  thread: one(aiThreads, {
    fields: [aiMessages.threadId],
    references: [aiThreads.id],
  }),
}));

export const aiRunsRelations = relations(aiRuns, ({ one }) => ({
  workspace: one(organization, {
    fields: [aiRuns.workspaceId],
    references: [organization.id],
  }),
}));

export const aiUserMemoryRelations = relations(aiUserMemory, ({ one }) => ({
  user: one(user, {
    fields: [aiUserMemory.userId],
    references: [user.id],
  }),
}));

export const aiModelPrefsRelations = relations(aiModelPrefs, ({ one }) => ({
  user: one(user, {
    fields: [aiModelPrefs.userId],
    references: [user.id],
  }),
}));

export const aiUsageDailyRelations = relations(aiUsageDaily, ({ one }) => ({
  workspace: one(organization, {
    fields: [aiUsageDaily.workspaceId],
    references: [organization.id],
  }),
}));
