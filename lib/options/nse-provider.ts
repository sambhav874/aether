import "server-only";
import { NseIndia } from "stock-nse-india";
import type {
  OptionChainInstrument,
  OptionChainResult,
  ExpiryListResult,
  OptionStrike,
  OptionLeg,
  OptionChainTotals,
} from "@/lib/runners/dhan/option-chain";

// NSE's own public option-chain data, via `stock-nse-india` — no key, no
// broker account. Plain header-spoofed fetch (our first attempt) gets
// Akamai-blocked outright; this library does the real session bootstrap
// (homepage warm-up, cookie jar, retry-on-expiry) that NSE's WAF actually
// checks for, which a one-shot fetch can't replicate. NSE only publishes
// chains for its own index/equity derivatives; SENSEX (BSE-listed) has no
// equivalent here, so it always falls through to Dhan.
const NSE_SYMBOL: Partial<Record<OptionChainInstrument, string>> = {
  NIFTY: "NIFTY",
  BANKNIFTY: "BANKNIFTY",
};

// Single shared instance: it holds a session cookie jar internally that's
// expensive to re-bootstrap (a homepage round-trip) on every call. Exported
// so other NSE-backed features (e.g. the watchlist) reuse the same session
// instead of paying for a second cookie bootstrap.
export const nse = new NseIndia();

type NseOptionLeg = {
  openInterest: number;
  impliedVolatility: number;
  totalTradedVolume: number;
  bidPrice1: number;
  askPrice1: number;
  lastPrice: number;
};

type NseChainRow = {
  strikePrice: number;
  expiryDates: string;
  CE?: NseOptionLeg;
  PE?: NseOptionLeg;
};

type NseIndexOptionChainResponse = {
  records?: {
    data?: NseChainRow[];
    expiryDates?: string[];
    underlyingValue?: number;
  };
};

function toLeg(leg: NseOptionLeg | undefined): OptionLeg | null {
  if (!leg) return null;
  return {
    ltp: leg.lastPrice,
    oi: leg.openInterest,
    iv: leg.impliedVolatility,
    volume: leg.totalTradedVolume,
    bid: leg.bidPrice1,
    ask: leg.askPrice1,
    // NSE's public feed carries no greeks — Dhan-shaped OptionLeg keeps
    // them at 0 rather than making the field optional, so the shared modal
    // renders both sources identically.
    delta: 0,
    gamma: 0,
    theta: 0,
    vega: 0,
  };
}

export function isNseSupported(instrument: OptionChainInstrument): boolean {
  return instrument in NSE_SYMBOL;
}

export async function getNseExpiryList(instrument: OptionChainInstrument): Promise<ExpiryListResult> {
  const symbol = NSE_SYMBOL[instrument];
  if (!symbol) return { status: "unavailable", reason: `${instrument} is not published by NSE` };

  try {
    const info = await nse.getIndexOptionChainContractInfo(symbol);
    const expiries = info?.expiryDates;
    if (!expiries || expiries.length === 0) {
      return { status: "unavailable", reason: "NSE returned no expiries" };
    }
    return { status: "ok", expiries };
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : "network error" };
  }
}

export async function getNseOptionChain(
  instrument: OptionChainInstrument,
  expiry: string,
): Promise<OptionChainResult> {
  const symbol = NSE_SYMBOL[instrument];
  if (!symbol) return { status: "unavailable", reason: `${instrument} is not published by NSE` };

  try {
    const data = (await nse.getIndexOptionChain(symbol, expiry)) as NseIndexOptionChainResponse;
    const records = data?.records;
    if (!records?.data || records.underlyingValue === undefined) {
      return { status: "unavailable", reason: "NSE returned no option chain data" };
    }

    const strikes: OptionStrike[] = records.data
      .filter((row) => row.expiryDates === expiry)
      .map((row) => ({
        strike: row.strikePrice,
        ce: toLeg(row.CE),
        pe: toLeg(row.PE),
      }))
      .sort((a, b) => a.strike - b.strike);

    if (strikes.length === 0) {
      return { status: "unavailable", reason: "empty strike ladder for this expiry" };
    }

    const totals = strikes.reduce<OptionChainTotals>(
      (acc, row) => ({
        ceOi: acc.ceOi + (row.ce?.oi ?? 0),
        ceVolume: acc.ceVolume + (row.ce?.volume ?? 0),
        peOi: acc.peOi + (row.pe?.oi ?? 0),
        peVolume: acc.peVolume + (row.pe?.volume ?? 0),
      }),
      { ceOi: 0, ceVolume: 0, peOi: 0, peVolume: 0 },
    );

    return { status: "ok", underlyingPrice: records.underlyingValue, strikes, totals };
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : "network error" };
  }
}
