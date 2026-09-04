"use server";

import { requireActiveWorkspace } from "@/lib/auth/session";
import { getWorkspaceAccounts } from "@/lib/strategies/accounts";
import { getWatchlistIndices } from "@/lib/market/watchlist";
import { getUsWatchlist, searchSymbols, getSymbolQuote } from "@/lib/market/quotes-us";
import { getForexRates } from "@/lib/market/quotes-forex";
import { getIndiaSymbolQuote } from "@/lib/market/quotes-india";
import { getIndiaDailyCandles, type CandleChartResult } from "@/lib/market/india-chart";
import type {
  QuoteListResult,
  SearchResult,
  SymbolQuoteResult,
  UsListResult,
  WatchlistResult,
  WatchlistRow,
} from "@/lib/market/types";
import { getIndexQuote } from "@/lib/runners/dhan/market-quote";
import { getIndexQuote as getMotilalIndexQuote } from "@/lib/runners/motilal/market-quote";

const SENSEX = { securityId: 51, segment: "IDX_I" };
const SENSEX_MOTILAL = { name: "SENSEX", exchange: "BSE" } as const;

export async function fetchWatchlist(): Promise<WatchlistResult> {
  const { workspace } = await requireActiveWorkspace();

  const nseResult = await getWatchlistIndices();
  if (nseResult.status !== "ok") return nseResult;

  const rows: WatchlistRow[] = [...nseResult.rows];

  // SENSEX is BSE-listed, so it isn't in NSE's index feed — pull it from a
  // connected broker account when one exists, otherwise just omit it rather
  // than showing a fake/stale row. Dhan is preferred (its OHLC endpoint is a
  // single call), with Motilal's index-LTP endpoint as the fallback for
  // workspaces that only connected MO.
  const accounts = await getWorkspaceAccounts(workspace.id);
  const dhanAccount = accounts.find((a) => a.provider === "dhan" && a.status === "connected");
  const motilalAccount = accounts.find((a) => a.provider === "motilal" && a.status === "connected");

  if (dhanAccount || motilalAccount) {
    const quote = dhanAccount
      ? await getIndexQuote(dhanAccount.id, SENSEX)
      : await getMotilalIndexQuote(motilalAccount!.id, SENSEX_MOTILAL);
    rows.push({
      symbol: "SENSEX",
      name: "SENSEX",
      tab: "BSE",
      last: quote.status === "ok" ? quote.last : null,
      change: quote.status === "ok" ? quote.change : null,
      changePct: quote.status === "ok" ? quote.changePct : null,
      chartSymbol: "BSE:SENSEX",
    });
  }

  return { status: "ok", rows };
}

export async function fetchUsWatchlist(): Promise<UsListResult> {
  await requireActiveWorkspace();
  return getUsWatchlist();
}

export async function fetchForexWatchlist(): Promise<QuoteListResult> {
  await requireActiveWorkspace();
  return getForexRates();
}

export async function searchSymbolsAction(query: string): Promise<SearchResult> {
  await requireActiveWorkspace();
  return searchSymbols(query);
}

export async function fetchSymbolQuoteAction(symbol: string, name: string): Promise<SymbolQuoteResult> {
  await requireActiveWorkspace();
  // NSE-listed equities (Finnhub's search surfaces them as "SYMBOL.NS") need
  // the free NSE feed — Finnhub's own /quote 403s on non-US equities.
  if (symbol.endsWith(".NS")) return getIndiaSymbolQuote(symbol, name);
  return getSymbolQuote(symbol, name);
}

export async function fetchIndiaChartAction(symbol: string, kind: "equity" | "index"): Promise<CandleChartResult> {
  await requireActiveWorkspace();
  return getIndiaDailyCandles(symbol, kind);
}
