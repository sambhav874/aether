import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// Per-user custom RSS sources layered on top of the hardcoded FEEDS in
// lib/research/rss.ts — not workspace-scoped, since feed taste is personal.
export const userRssFeeds = pgTable(
  "user_rss_feeds",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    url: text("url").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_rss_feeds_user_url_uidx").on(table.userId, table.url),
    index("user_rss_feeds_user_idx").on(table.userId),
  ],
);

export const userRssFeedsRelations = relations(userRssFeeds, ({ one }) => ({
  user: one(user, {
    fields: [userRssFeeds.userId],
    references: [user.id],
  }),
}));
