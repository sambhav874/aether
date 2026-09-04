"use client";

import * as React from "react";
import { RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchAggregatedNews, fetchTickerNews } from "@/lib/research/actions";
import type { NewsArticle, NewsMarketTag, NewsResult } from "@/lib/research/types";

const MARKET_TABS: { value: NewsMarketTag | "ALL" | "MINE"; label: string }[] = [
  { value: "ALL", label: "All Markets" },
  { value: "INDIA", label: "India" },
  { value: "US", label: "US" },
  { value: "GLOBAL", label: "Global" },
  { value: "CRYPTO", label: "Crypto" },
  { value: "MINE", label: "My Feeds" },
];

const MARKET_BADGE_TONE: Record<NewsMarketTag, string> = {
  INDIA: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  US: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  GLOBAL: "bg-muted text-muted-foreground",
  CRYPTO: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function ArticleRow({ article }: { article: NewsArticle }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg border p-4 transition-colors hover:bg-muted/50"
    >
      <p className="font-medium">{article.headline}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{article.source}</span>
        <span>·</span>
        <span>{timeAgo(article.publishedAt)}</span>
        {article.market && (
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", MARKET_BADGE_TONE[article.market])}>
            {article.market}
          </span>
        )}
        {article.isCustom && (
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            my feed
          </span>
        )}
        {article.tickers.map((t) => (
          <span key={t} className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
            {t}
          </span>
        ))}
      </div>
    </a>
  );
}

function UnavailablePanel({ reason }: { reason: string }) {
  return (
    <div className="rounded-lg border border-dashed p-12 text-center">
      <p className="font-medium">News unavailable</p>
      <p className="mt-1 text-sm text-muted-foreground">{reason}</p>
    </div>
  );
}

export function ResearchPage({ initial }: { initial: NewsResult }) {
  const [market, setMarket] = React.useState<NewsMarketTag | "ALL" | "MINE">("ALL");
  const [result, setResult] = React.useState<NewsResult>(initial);
  const [search, setSearch] = React.useState("");
  const [activeTicker, setActiveTicker] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function selectMarket(next: NewsMarketTag | "ALL" | "MINE") {
    setMarket(next);
    setActiveTicker(null);
    startTransition(async () => {
      // "My Feeds" isn't a server-side market — fetch everything, filter client-side.
      setResult(await fetchAggregatedNews(next === "ALL" || next === "MINE" ? undefined : next));
    });
  }

  function searchTicker(e: React.FormEvent) {
    e.preventDefault();
    const symbol = search.trim().toUpperCase();
    if (!symbol) return;
    setActiveTicker(symbol);
    startTransition(async () => {
      setResult(await fetchTickerNews(symbol));
    });
  }

  function refresh() {
    startTransition(async () => {
      if (activeTicker) {
        setResult(await fetchTickerNews(activeTicker));
      } else {
        setResult(await fetchAggregatedNews(market === "ALL" || market === "MINE" ? undefined : market));
      }
    });
  }

  const marketScoped =
    result.status === "ok" ? (market === "MINE" ? result.articles.filter((a) => a.isCustom) : result.articles) : [];

  const filteredArticles =
    result.status === "ok" && search.trim() && !activeTicker
      ? marketScoped.filter((a) => a.headline.toLowerCase().includes(search.trim().toLowerCase()))
      : marketScoped;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">News</h1>
        <p className="text-sm text-muted-foreground">Real-time financial news from multiple sources</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1">
          {MARKET_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => selectMarket(t.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                market === t.value && !activeTicker
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <form onSubmit={searchTicker} className="relative">
            <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search news..."
              className="h-9 w-56 rounded-md border bg-background pr-3 pl-8 text-sm"
            />
          </form>
          <button
            type="button"
            onClick={refresh}
            disabled={pending}
            title="Refresh"
            className="inline-flex size-9 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("size-4", pending && "animate-spin")} />
          </button>
        </div>
      </div>

      {activeTicker && (
        <p className="text-sm text-muted-foreground">
          Showing news for <span className="font-medium text-foreground">{activeTicker}</span> —{" "}
          <button type="button" className="underline" onClick={() => selectMarket(market)}>
            back to headlines
          </button>
        </p>
      )}

      {pending ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : result.status === "ok" ? (
        filteredArticles.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
            {search.trim() ? (
              <>No headlines match &ldquo;{search}&rdquo;.</>
            ) : market === "MINE" ? (
              <>
                No articles from your custom feeds yet. Add one in{" "}
                <a href="/dashboard/settings" className="underline">
                  Settings
                </a>{" "}
                and use its Test button to confirm it parses.
              </>
            ) : (
              "No headlines available."
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredArticles.map((article) => (
              <ArticleRow key={article.id} article={article} />
            ))}
          </div>
        )
      ) : (
        <UnavailablePanel reason={result.reason} />
      )}
    </div>
  );
}
