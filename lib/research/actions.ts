"use server";

import { getMarketNews, getTickerNews } from "@/lib/research/finnhub";
import { getAggregatedNews } from "@/lib/research/rss";
import { getActiveUserRssFeeds } from "@/lib/rss-feeds/actions";
import { requireActiveWorkspace } from "@/lib/auth/session";
import { hasWorkspacePermission } from "@/lib/auth/permissions";
import type { NewsResult, NewsMarketTag } from "@/lib/research/types";

const DENIED: NewsResult = { status: "unavailable", reason: "You don't have permission to view research/news." };

export async function fetchMarketNews(category: "general" | "forex" | "crypto" | "merger"): Promise<NewsResult> {
  const { role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { research: ["view"] })) return DENIED;
  return getMarketNews(category);
}

/** RSS-aggregated headlines (CNBC/MarketWatch/Yahoo/LiveMint/CoinDesk) —
 * powers the "All Markets / India / US / Global / Crypto" pills, replacing
 * the TradingView headlines widget. */
export async function fetchAggregatedNews(market?: NewsMarketTag): Promise<NewsResult> {
  const { role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { research: ["view"] })) return DENIED;
  const customFeeds = await getActiveUserRssFeeds();
  return getAggregatedNews(market, customFeeds);
}

export async function fetchTickerNews(symbol: string): Promise<NewsResult> {
  const { role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { research: ["view"] })) return DENIED;
  const trimmed = symbol.trim();
  if (!trimmed) return { status: "unavailable", reason: "enter a ticker symbol" };
  return getTickerNews(trimmed);
}
