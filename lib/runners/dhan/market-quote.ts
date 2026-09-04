import "server-only";
import { dhanFetch, getCreds } from "@/lib/runners/dhan";

// Verified against dhanhq.co/docs/v2/market-quote — OHLC endpoint's `close`
// field is the previous session's close, giving us change/changePct without
// a separate call.
type DhanOhlcResponse = {
  data?: Record<string, Record<string, { last_price: number; ohlc: { close: number } }>>;
  status?: string;
};

export type QuoteResult =
  | { status: "ok"; last: number; change: number; changePct: number }
  | { status: "unavailable"; reason: string };

export async function getIndexQuote(
  accountId: string,
  instrument: { securityId: number; segment: string },
): Promise<QuoteResult> {
  try {
    const creds = await getCreds(accountId);
    const response = await dhanFetch<DhanOhlcResponse>(creds, "/marketfeed/ohlc", {
      method: "POST",
      body: JSON.stringify({ [instrument.segment]: [instrument.securityId] }),
    });

    const leg = response.data?.[instrument.segment]?.[String(instrument.securityId)];
    if (!leg) return { status: "unavailable", reason: "no quote returned" };

    const change = leg.last_price - leg.ohlc.close;
    const changePct = leg.ohlc.close !== 0 ? (change / leg.ohlc.close) * 100 : 0;
    return { status: "ok", last: leg.last_price, change, changePct };
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : "network error" };
  }
}
