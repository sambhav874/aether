import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { brokerAccounts } from "@/db/schema";
import { requireActiveWorkspace } from "@/lib/auth/session";
import { getPositions, computeKpis } from "@/lib/positions/queries";
import { isNseOpen, isForexLive } from "@/lib/market-hours";
import { TradingViewEconomicCalendar } from "@/components/charts/tradingview-economic-calendar";
import { getAggregatedNews } from "@/lib/research/rss";
import { getActiveUserRssFeeds } from "@/lib/rss-feeds/actions";
import { OverviewShell } from "@/components/overview/overview-shell";
import type { AccountRow } from "@/components/overview/accounts-panel";
import { WatchlistPanel } from "@/components/market/watchlist-panel";
import { fetchWatchlist } from "@/lib/market/actions";
import { SelectedSymbolProvider } from "@/components/market/selected-symbol-context";
import type { NewsArticle } from "@/lib/research/types";

// News/watchlist must reflect the latest data on every visit, not a
// route-cache snapshot from an earlier request.
export const dynamic = "force-dynamic";

/** Newest-12 slicing alone starves low-volume custom feeds behind
 * high-frequency built-in wires — pin up to 3 custom articles in so a
 * newly added feed is actually visible here, not just on the full News page. */
function selectHeadlines(articles: NewsArticle[], limit = 12, reserveCustom = 3): NewsArticle[] {
  const top = articles.slice(0, limit);
  const customIds = new Set(top.filter((a) => a.isCustom).map((a) => a.id));
  const missingCustom = articles.filter((a) => a.isCustom && !customIds.has(a.id)).slice(0, Math.max(0, reserveCustom - customIds.size));
  if (missingCustom.length === 0) return top;

  const kept = top.slice(0, Math.max(0, limit - missingCustom.length));
  return [...kept, ...missingCustom].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default async function OverviewPage() {
  const { workspace } = await requireActiveWorkspace();

  const [forexPositions, optionsPositions, accountRows, news, watchlist] = await Promise.all([
    getPositions(workspace.id, "forex"),
    getPositions(workspace.id, "indian_options"),
    db
      .select({
        id: brokerAccounts.id,
        label: brokerAccounts.label,
        provider: brokerAccounts.provider,
        balance: brokerAccounts.balance,
        currency: brokerAccounts.currency,
      })
      .from(brokerAccounts)
      .where(eq(brokerAccounts.workspaceId, workspace.id)),
    getActiveUserRssFeeds().then((customFeeds) => getAggregatedNews(undefined, customFeeds)),
    fetchWatchlist(),
  ]);

  const accounts: AccountRow[] = accountRows.map((row) => ({
    id: row.id,
    label: row.label,
    provider: row.provider,
    balance: row.balance !== null ? Number(row.balance) : null,
    currency: row.currency === "INR" ? "INR" : "USD",
  }));

  return (
    <SelectedSymbolProvider>
    <div className="grid gap-4 xl:grid-cols-[320px_1fr_340px]">
      <aside className="h-full">
        <WatchlistPanel initial={watchlist} />
      </aside>

      <OverviewShell
        nseOpen={isNseOpen()}
        forexLive={isForexLive()}
        forex={{
          kpis: computeKpis(forexPositions),
          openPositions: forexPositions.filter((p) => p.status === "open"),
        }}
        options={{
          kpis: computeKpis(optionsPositions),
          openPositions: optionsPositions.filter((p) => p.status === "open"),
        }}
        accounts={accounts}
      />

      <aside className="space-y-4">
        <div>
          <h2 className="mb-2 text-sm font-semibold">Economic Calendar</h2>
          <div className="h-[420px]">
            <TradingViewEconomicCalendar />
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Headlines</h2>
            <a href="/dashboard/monarch/research" className="text-xs text-muted-foreground hover:text-foreground">
              View all
            </a>
          </div>
          <div className="h-[420px] space-y-2 overflow-y-auto rounded-lg border p-2">
            {news.status === "ok" ? (
              selectHeadlines(news.articles).map((article) => (
                <a
                  key={article.id}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-md p-2 text-xs transition-colors hover:bg-muted/50"
                >
                  <p className="line-clamp-2 font-medium">{article.headline}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                    <span>
                      {article.source} · {timeAgo(article.publishedAt)}
                    </span>
                    {article.isCustom && (
                      <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground">
                        my feed
                      </span>
                    )}
                  </p>
                </a>
              ))
            ) : (
              <p className="p-2 text-xs text-muted-foreground">{news.reason}</p>
            )}
          </div>
        </div>
      </aside>
    </div>
    </SelectedSymbolProvider>
  );
}
