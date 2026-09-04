import "server-only";
import { z } from "zod";
import { getTickerNews } from "@/lib/research/finnhub";
import { getAggregatedNews } from "@/lib/research/rss";
import { getUserCustomFeeds } from "./user-rss";
import { ok, unavailable, type ToolResult } from "./shared";

export const searchNewsInputSchema = z.object({
  symbol: z.string().optional(),
  query: z.string().optional(),
  market: z.enum(["INDIA", "US", "GLOBAL", "CRYPTO"]).optional(),
  since: z.enum(["6h", "24h", "7d"]).default("24h"),
  limit: z.number().int().min(1).max(30).default(15),
});
export type SearchNewsInput = z.infer<typeof searchNewsInputSchema>;

export type NewsHit = { headline: string; source: string; publishedAt: string; url: string; sentiment: "positive" | "negative" | "neutral" | null };

const SINCE_MS: Record<SearchNewsInput["since"], number> = {
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

/**
 * Headlines and metadata only — never article bodies (unbounded, low-signal,
 * and the primary prompt-injection vector; see PLAN_AI_COPILOT.md §7).
 * `symbol` routes to Finnhub's per-ticker company news; otherwise pulls the
 * aggregated RSS set (lib/research/rss.ts), merging the caller's own
 * user_rss_feeds when `userId` is supplied — that's the one place this tool
 * touches personal data, so it's a second `ctx` argument rather than part of
 * the model-facing schema above, same convention as the get_my_* tools.
 */
export async function searchNews(input: SearchNewsInput, ctx: { userId?: string } = {}): Promise<ToolResult<{ articles: NewsHit[] }>> {
  const cutoff = Date.now() - SINCE_MS[input.since];

  let result;
  if (input.symbol) {
    result = await getTickerNews(input.symbol);
  } else {
    const customFeeds = ctx.userId ? await getUserCustomFeeds(ctx.userId) : [];
    result = await getAggregatedNews(input.market, customFeeds);
  }

  if (result.status === "unavailable") return unavailable(result.reason);

  const query = input.query?.trim().toLowerCase();
  const articles = result.articles
    .filter((a) => new Date(a.publishedAt).getTime() >= cutoff)
    .filter((a) => !query || a.headline.toLowerCase().includes(query) || a.summary.toLowerCase().includes(query))
    .slice(0, input.limit)
    .map((a): NewsHit => ({ headline: a.headline, source: a.source, publishedAt: a.publishedAt, url: a.url, sentiment: a.sentiment }));

  return ok({ articles });
}
