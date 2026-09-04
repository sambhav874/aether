import "server-only";
import { motilalFetch, getCreds } from "@/lib/runners/motilal/client";
import { resolveScrip, type MotilalExchange } from "@/lib/runners/motilal/instruments";

/**
 * Motilal does serve quotes — a REST LTP endpoint per scrip and a separate
 * one for indices (PriceLTPAPI.html / IndexLtpAPI.html). What it has no
 * public equivalent of is Dhan's streaming tick feed, so this is a pull-only
 * substitute: good for a watchlist row or a mark price, not for a strategy
 * that needs live ticks.
 */
export type QuoteResult =
  | { status: "ok"; last: number; change: number; changePct: number }
  | { status: "unavailable"; reason: string };

type MotilalLtpRow = {
  exchange: string;
  scripcode: number;
  open: number;
  high: number;
  low: number;
  close: number;
  ltp: number;
  volume?: number;
};

// getltpdata quotes every price in paise ("The values of open, high, low,
// close and ltp are in paisa" — PriceLTPAPI.html). getindexltpdata does not:
// its sample returns 17566.6 for NIFTY, i.e. already rupees.
const PAISE_PER_RUPEE = 100;

function toQuote(row: MotilalLtpRow, divisor: number): QuoteResult {
  const last = row.ltp / divisor;
  const close = row.close / divisor;
  const change = last - close;
  return {
    status: "ok",
    last,
    change,
    changePct: close !== 0 ? (change / close) * 100 : 0,
  };
}

/** Scrip LTP (equity/derivative). `symbol` accepts a trading symbol or MO's
 * own numeric scripcode. */
export async function getScripQuote(
  accountId: string,
  symbol: string,
  exchange: MotilalExchange = "NSE",
): Promise<QuoteResult> {
  try {
    const creds = await getCreds(accountId);
    const scrip = await resolveScrip(creds, symbol, exchange);

    const res = await motilalFetch<{ data?: MotilalLtpRow[] }>(creds, "/rest/report/v1/getltpdata", {
      method: "POST",
      body: JSON.stringify({
        clientcode: creds.clientCode,
        exchange: scrip.exchange,
        scripcode: scrip.scripcode,
      }),
    });

    const row = res.data?.[0];
    if (!row) return { status: "unavailable", reason: "no quote returned" };
    return toQuote(row, PAISE_PER_RUPEE);
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : "network error" };
  }
}

/** Index LTP (NIFTY, SENSEX, ...). Indices are listed in the cash scrip
 * master, so the index name resolves through the same lookup as a stock. */
export async function getIndexQuote(
  accountId: string,
  index: { name: string; exchange: "NSE" | "BSE" } | { scripcode: number; exchange: "NSE" | "BSE" },
): Promise<QuoteResult> {
  try {
    const creds = await getCreds(accountId);
    const scripcode =
      "scripcode" in index
        ? index.scripcode
        : (await resolveScrip(creds, index.name, index.exchange)).scripcode;

    const res = await motilalFetch<{ data?: MotilalLtpRow[] }>(creds, "/rest/report/v1/getindexltpdata", {
      method: "POST",
      body: JSON.stringify({
        clientcode: creds.clientCode,
        exchangename: index.exchange,
        scripcode: String(scripcode),
      }),
    });

    const row = res.data?.[0];
    if (!row) return { status: "unavailable", reason: "no quote returned" };
    return toQuote(row, 1);
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : "network error" };
  }
}
