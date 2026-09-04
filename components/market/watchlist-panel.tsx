"use client";

import * as React from "react";
import { Search, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchWatchlist, fetchUsWatchlist, fetchForexWatchlist, searchSymbolsAction, fetchSymbolQuoteAction } from "@/lib/market/actions";
import {
  MARKET_GROUP_LABELS,
  US_CATEGORY_LABELS,
  WATCHLIST_TAB_LABELS,
  type MarketGroup,
  type QuoteListResult,
  type QuoteRow,
  type SearchHit,
  type SymbolQuoteResult,
  type UsCategory,
  type UsListResult,
  type WatchlistResult,
  type WatchlistTab,
} from "@/lib/market/types";
import { useSelectedSymbol, type Selected } from "@/components/market/selected-symbol-context";

const REFRESH_MS = 30_000;
const FAVOURITES_KEY = "monarch:watchlist:favourites";
const MARKETS = Object.keys(MARKET_GROUP_LABELS) as MarketGroup[];
const INDIA_TABS = Object.keys(WATCHLIST_TAB_LABELS) as WatchlistTab[];
const US_TABS = Object.keys(US_CATEGORY_LABELS) as UsCategory[];

type FavItem = { symbol: string; name: string };

function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function loadFavourites(): FavItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FAVOURITES_KEY);
    return raw ? (JSON.parse(raw) as FavItem[]) : [];
  } catch {
    return [];
  }
}

function saveFavourites(items: FavItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FAVOURITES_KEY, JSON.stringify(items));
}

// Best-effort TradingView symbol mapping per source — India indices use
// row.chartSymbol (verified tickers only, set in lib/market/watchlist.ts);
// these three are single-ticker sources where a guess is reliable enough.
function usTvSymbol(row: QuoteRow): string {
  return row.symbol;
}
function forexTvSymbol(row: QuoteRow): string {
  return `OANDA:${row.name.replace("/", "")}`;
}
function favTvSymbol(item: FavItem): string {
  return item.symbol.endsWith(".NS") ? `NSE:${item.symbol.slice(0, -3)}` : item.symbol;
}

function favSelected(item: FavItem): Selected {
  if (item.symbol.endsWith(".NS")) {
    const stripped = item.symbol.slice(0, -3);
    // Our own chart (NSE's free feed) — TradingView's free embed blocks
    // most individual NSE equities behind exchange data licensing.
    return { source: "india", symbol: stripped, kind: "equity", label: item.name, tvSymbol: `NSE:${stripped}` };
  }
  return { source: "tradingview", tvSymbol: favTvSymbol(item), label: item.name };
}

function QuoteContent({ symbol, name, last, change, changePct }: QuoteRow) {
  return (
    <>
      <div className="min-w-0 flex-1 pr-2">
        <p className="truncate text-sm font-medium">{symbol}</p>
        <p className="truncate text-xs text-muted-foreground">{name}</p>
      </div>
      {last !== null ? (
        <div className="shrink-0 text-right tabular-figures">
          <p className="text-sm font-medium">{formatNumber(last)}</p>
          <p className={cn("text-xs", (change ?? 0) >= 0 ? "text-positive" : "text-negative")}>
            {(change ?? 0) >= 0 ? "+" : ""}
            {formatNumber(change ?? 0)} {(changePct ?? 0) >= 0 ? "+" : ""}
            {(changePct ?? 0).toFixed(2)}%
          </p>
        </div>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">—</span>
      )}
    </>
  );
}

function QuoteRowView({ onClick, ...row }: QuoteRow & { onClick?: () => void }) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      className={cn("flex min-w-0 items-center justify-between px-2 py-3", onClick && "cursor-pointer hover:bg-muted/50")}
    >
      <QuoteContent {...row} />
    </div>
  );
}

function UnavailablePanel({ reason }: { reason: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center">
      <p className="text-sm font-medium">Unavailable</p>
      <p className="text-xs text-muted-foreground">{reason}</p>
    </div>
  );
}

function FavouriteRow({
  item,
  quote,
  onRemove,
  onClick,
}: {
  item: FavItem;
  quote: SymbolQuoteResult | undefined;
  onRemove: () => void;
  onClick: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between px-2 py-3">
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        className="flex min-w-0 flex-1 cursor-pointer items-center justify-between hover:opacity-80"
      >
        {!quote ? (
          <>
            <div className="min-w-0 flex-1 pr-2">
              <p className="truncate text-sm font-medium">{item.symbol}</p>
              <p className="truncate text-xs text-muted-foreground">{item.name}</p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">Loading…</span>
          </>
        ) : quote.status === "ok" ? (
          <QuoteContent {...quote.row} />
        ) : (
          <>
            <div className="min-w-0 flex-1 pr-2">
              <p className="truncate text-sm font-medium">{item.symbol}</p>
              <p className="truncate text-xs text-muted-foreground">{item.name}</p>
            </div>
            <span className="max-w-[45%] shrink-0 text-right text-xs text-muted-foreground">{quote.reason}</span>
          </>
        )}
      </div>
      <button type="button" onClick={onRemove} className="ml-2 text-muted-foreground hover:text-foreground">
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function SearchBar({ onPick }: { onPick: (hit: SearchHit) => void }) {
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    const timeout = setTimeout(() => {
      if (!query.trim()) {
        setHits([]);
        return;
      }
      startTransition(async () => {
        const result = await searchSymbolsAction(query);
        setHits(result.status === "ok" ? result.hits : []);
        setOpen(true);
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <div className="relative">
      <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => hits.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search any stock…"
        className="h-8 w-full rounded-md border bg-background pr-3 pl-8 text-sm"
      />
      {open && (pending || hits.length > 0) && (
        <div className="absolute top-full z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {pending ? (
            <p className="p-2 text-xs text-muted-foreground">Searching…</p>
          ) : (
            hits.map((hit) => (
              <button
                key={hit.symbol}
                type="button"
                className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs hover:bg-muted/50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(hit);
                  setQuery("");
                  setHits([]);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{hit.symbol}</span>
                <span className="truncate pl-2 text-muted-foreground">{hit.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function WatchlistPanel({ initial }: { initial: WatchlistResult }) {
  const { setSelected } = useSelectedSymbol();
  const [market, setMarket] = React.useState<MarketGroup>("india");
  const [india, setIndia] = React.useState<WatchlistResult>(initial);
  const [us, setUs] = React.useState<UsListResult | null>(null);
  const [forex, setForex] = React.useState<QuoteListResult | null>(null);
  const [favourites, setFavourites] = React.useState<FavItem[]>([]);
  const [favQuotes, setFavQuotes] = React.useState<Record<string, SymbolQuoteResult>>({});
  const favouritesRef = React.useRef<FavItem[]>([]);

  const refreshFavourite = React.useCallback(async (item: FavItem) => {
    const result = await fetchSymbolQuoteAction(item.symbol, item.name);
    setFavQuotes((prev) => ({ ...prev, [item.symbol]: result }));
  }, []);

  // Firing every favourite's quote fetch at once trips Finnhub's free-tier
  // burst limit (same issue as the US watchlist's batch fetch) — refresh
  // them one at a time instead.
  const refreshFavouritesSequentially = React.useCallback(
    async (items: FavItem[]) => {
      for (const item of items) {
        await refreshFavourite(item);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    },
    [refreshFavourite],
  );

  React.useEffect(() => {
    // Deferred a tick so the setState isn't synchronous within the effect
    // body — this only ever runs once, to hydrate from localStorage.
    void Promise.resolve().then(() => {
      const stored = loadFavourites();
      setFavourites(stored);
      favouritesRef.current = stored;
      void refreshFavouritesSequentially(stored);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMarket = React.useCallback(async (m: MarketGroup) => {
    if (m === "india") setIndia(await fetchWatchlist());
    else if (m === "us") setUs(await fetchUsWatchlist());
    else setForex(await fetchForexWatchlist());
  }, []);

  function selectMarket(m: MarketGroup) {
    setMarket(m);
    if (m === "us" && us === null) void loadMarket("us");
    if (m === "forex" && forex === null) void loadMarket("forex");
  }

  React.useEffect(() => {
    const interval = setInterval(() => {
      void loadMarket(market);
      void refreshFavouritesSequentially(favouritesRef.current);
    }, REFRESH_MS);
    return () => clearInterval(interval);
  }, [market, loadMarket, refreshFavouritesSequentially]);

  function addFavourite(hit: SearchHit) {
    setFavourites((prev) => {
      if (prev.some((f) => f.symbol === hit.symbol)) return prev;
      const next = [...prev, { symbol: hit.symbol, name: hit.name }];
      favouritesRef.current = next;
      saveFavourites(next);
      return next;
    });
    void refreshFavourite({ symbol: hit.symbol, name: hit.name });
  }

  function removeFavourite(symbol: string) {
    setFavourites((prev) => {
      const next = prev.filter((f) => f.symbol !== symbol);
      favouritesRef.current = next;
      saveFavourites(next);
      return next;
    });
    setFavQuotes((prev) => {
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col gap-3 rounded-lg border p-3">
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {MARKETS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => selectMarket(m)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
              market === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {MARKET_GROUP_LABELS[m]}
          </button>
        ))}
      </div>

      <SearchBar onPick={addFavourite} />

      <div className="min-h-0 flex-1 basis-0 overflow-x-hidden overflow-y-auto rounded-md border">
        {market === "india" &&
          (india.status !== "ok" ? (
            <UnavailablePanel reason={india.reason} />
          ) : (
            <Tabs defaultValue="NSE" className="flex h-full flex-col">
              <TabsList className="m-2 mb-1 flex-wrap justify-start gap-1">
                {INDIA_TABS.map((tab) => (
                  <TabsTrigger key={tab} value={tab}>
                    {WATCHLIST_TAB_LABELS[tab]}
                  </TabsTrigger>
                ))}
              </TabsList>
              {INDIA_TABS.map((tab) => (
                <TabsContent key={tab} value={tab} className="flex-1 overflow-x-hidden overflow-y-auto px-3">
                  <div className="divide-y">
                    {india.rows.filter((row) => row.tab === tab).map((row) => (
                      <QuoteRowView
                        key={row.symbol}
                        {...row}
                        onClick={() =>
                          row.tab === "NSE"
                            ? // Our own chart (lib/market/india-chart.ts) covers every NSE
                              // index — TradingView's free embed doesn't resolve most of
                              // NSE's ~135 index-family names.
                              setSelected({
                                source: "india",
                                symbol: row.name,
                                kind: "index",
                                label: row.name,
                                tvSymbol: row.chartSymbol ?? undefined,
                              })
                            : // BSE (SENSEX): NSE's endpoint resolves "SENSEX" to the wrong
                              // instrument, so this stays on the verified TradingView/Dhan path.
                              setSelected({ source: "tradingview", tvSymbol: row.chartSymbol!, label: row.name })
                        }
                      />
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          ))}

        {market === "us" &&
          (us === null ? (
            <p className="p-6 text-center text-xs text-muted-foreground">Loading…</p>
          ) : us.status !== "ok" ? (
            <UnavailablePanel reason={us.reason} />
          ) : (
            <Tabs defaultValue="indices" className="flex h-full flex-col">
              <TabsList className="m-2 mb-1 flex-wrap justify-start gap-1">
                {US_TABS.map((tab) => (
                  <TabsTrigger key={tab} value={tab}>
                    {US_CATEGORY_LABELS[tab]}
                  </TabsTrigger>
                ))}
              </TabsList>
              {US_TABS.map((tab) => (
                <TabsContent key={tab} value={tab} className="flex-1 overflow-x-hidden overflow-y-auto px-3">
                  <div className="divide-y">
                    {us.rows
                      .filter((row) => row.category === tab)
                      .map((row) => (
                        <QuoteRowView
                          key={row.symbol}
                          {...row}
                          onClick={() => setSelected({ source: "tradingview", tvSymbol: usTvSymbol(row), label: row.name })}
                        />
                      ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          ))}

        {market === "forex" &&
          (forex === null ? (
            <p className="p-6 text-center text-xs text-muted-foreground">Loading…</p>
          ) : forex.status !== "ok" ? (
            <UnavailablePanel reason={forex.reason} />
          ) : (
            <div className="divide-y px-3 py-2">
              <p className="pb-2 text-[10px] text-muted-foreground">ECB reference rates · updates once daily</p>
              {forex.rows.map((row) => (
                <QuoteRowView
                  key={row.symbol}
                  {...row}
                  onClick={() => setSelected({ source: "tradingview", tvSymbol: forexTvSymbol(row), label: row.name })}
                />
              ))}
            </div>
          ))}
      </div>

      {favourites.length > 0 && (
        <div className="min-h-0 flex-1 basis-0 overflow-x-hidden overflow-y-auto rounded-md border bg-muted/30">
          <div className="sticky top-0 flex items-center gap-1.5 border-b bg-muted/60 px-3 py-2 backdrop-blur-sm">
            <Star className="size-3 text-muted-foreground" />
            <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Favourites</span>
          </div>
          <div className="divide-y px-1">
            {favourites.map((item) => (
              <FavouriteRow
                key={item.symbol}
                item={item}
                quote={favQuotes[item.symbol]}
                onRemove={() => removeFavourite(item.symbol)}
                onClick={() => setSelected(favSelected(item))}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
