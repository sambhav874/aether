"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { userRssFeeds } from "@/db/schema";
import { getSession, requireActiveWorkspace } from "@/lib/auth/session";
import { hasWorkspacePermission } from "@/lib/auth/permissions";

export type UserRssFeed = {
  id: string;
  label: string;
  url: string;
  active: boolean;
};

function isValidFeedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function getUserRssFeeds(): Promise<UserRssFeed[]> {
  const { session, role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { research: ["view"] })) return [];
  return db
    .select({
      id: userRssFeeds.id,
      label: userRssFeeds.label,
      url: userRssFeeds.url,
      active: userRssFeeds.active,
    })
    .from(userRssFeeds)
    .where(eq(userRssFeeds.userId, session.user.id));
}

/** Active feeds only, shaped for getAggregatedNews(customFeeds). Never
 * throws on missing session — callers on public-ish pages can no-op. */
export async function getActiveUserRssFeeds(): Promise<{ source: string; url: string }[]> {
  const session = await getSession();
  if (!session) return [];

  const rows = await db
    .select({ label: userRssFeeds.label, url: userRssFeeds.url })
    .from(userRssFeeds)
    .where(and(eq(userRssFeeds.userId, session.user.id), eq(userRssFeeds.active, true)));

  return rows.map((r) => ({ source: r.label, url: r.url }));
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export type FeedTestResult = { ok: boolean; itemCount?: number; error?: string };

/** Fetches a feed URL once and reports whether it parses as RSS with items —
 * lets a user confirm a feed actually works without waiting on the news page. */
export async function testUserRssFeed(url: string): Promise<FeedTestResult> {
  const { role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { research: ["view"] })) {
    return { ok: false, error: "You don't have permission to manage research feeds." };
  }

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml, text/xml" },
      cache: "no-store",
    });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };

    const xml = await response.text();
    const itemCount = (xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? []).length;
    if (itemCount === 0) return { ok: false, error: "No <item> entries found — not a valid RSS feed" };

    return { ok: true, itemCount };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Fetch failed" };
  }
}

export async function addUserRssFeed(label: string, url: string): Promise<{ error?: string }> {
  const { session, role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { research: ["view"] })) {
    return { error: "You don't have permission to manage research feeds." };
  }

  const trimmedLabel = label.trim();
  const trimmedUrl = url.trim();
  if (!trimmedLabel) return { error: "Label is required." };
  if (!isValidFeedUrl(trimmedUrl)) return { error: "Enter a valid http(s) feed URL." };

  try {
    await db.insert(userRssFeeds).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      label: trimmedLabel,
      url: trimmedUrl,
    });
  } catch {
    return { error: "That feed URL is already in your list." };
  }

  revalidatePath("/dashboard/settings");
  return {};
}

export async function toggleUserRssFeed(feedId: string): Promise<void> {
  const { session, role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { research: ["view"] })) return;
  const [feed] = await db
    .select({ active: userRssFeeds.active })
    .from(userRssFeeds)
    .where(and(eq(userRssFeeds.id, feedId), eq(userRssFeeds.userId, session.user.id)))
    .limit(1);
  if (!feed) return;

  await db
    .update(userRssFeeds)
    .set({ active: !feed.active })
    .where(and(eq(userRssFeeds.id, feedId), eq(userRssFeeds.userId, session.user.id)));

  revalidatePath("/dashboard/settings");
}

export async function deleteUserRssFeed(feedId: string): Promise<void> {
  const { session, role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { research: ["view"] })) return;
  await db
    .delete(userRssFeeds)
    .where(and(eq(userRssFeeds.id, feedId), eq(userRssFeeds.userId, session.user.id)));

  revalidatePath("/dashboard/settings");
}
