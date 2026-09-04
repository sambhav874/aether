import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { userRssFeeds } from "@/db/schema";

export type CustomFeed = { source: string; url: string };

/** A user's own active RSS feeds (Settings → RSS feeds), in the shape lib/research/rss.ts's getAggregatedNews expects for its customFeeds param. Split out so callers (search_news) can be tested without touching Drizzle directly. */
export async function getUserCustomFeeds(userId: string): Promise<CustomFeed[]> {
  const rows = await db
    .select({ source: userRssFeeds.label, url: userRssFeeds.url })
    .from(userRssFeeds)
    .where(and(eq(userRssFeeds.userId, userId), eq(userRssFeeds.active, true)));
  return rows;
}
