import "server-only";
import { dhanFetch, getCreds } from "@/lib/runners/dhan";

// Verified against Dhan's own published docs (dhanhq.co/docs/v2/option-chain)
// and its public instrument scrip master
// (images.dhan.co/api-data/api-scrip-master.csv) — these three are real,
// current security IDs, not guessed. IDX_I is the one index segment Dhan
// documents (dhanhq.co/docs/v2/annexure — enum 0, no separate BSE variant),
// so SENSEX uses it too despite being BSE-listed.
export const OPTION_CHAIN_INSTRUMENTS = {
  NIFTY: { securityId: 13, segment: "IDX_I", label: "NIFTY" },
  BANKNIFTY: { securityId: 25, segment: "IDX_I", label: "Bank Nifty" },
  SENSEX: { securityId: 51, segment: "IDX_I", label: "Sensex" },
} as const;

export type OptionChainInstrument = keyof typeof OPTION_CHAIN_INSTRUMENTS;

export type OptionLeg = {
  ltp: number;
  oi: number;
  iv: number;
  volume: number;
  bid: number;
  ask: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
};

export type OptionStrike = {
  strike: number;
  ce: OptionLeg | null;
  pe: OptionLeg | null;
};

export type OptionChainTotals = { ceOi: number; ceVolume: number; peOi: number; peVolume: number };

export type OptionChainResult =
  | { status: "ok"; underlyingPrice: number; strikes: OptionStrike[]; totals: OptionChainTotals }
  | { status: "unavailable"; reason: string };

export type ExpiryListResult = { status: "ok"; expiries: string[] } | { status: "unavailable"; reason: string };

type DhanOptionLeg = {
  last_price: number;
  oi: number;
  implied_volatility: number;
  volume: number;
  top_bid_price: number;
  top_ask_price: number;
  greeks: { delta: number; gamma: number; theta: number; vega: number };
};

type DhanOptionChainResponse = {
  data?: { last_price: number; oc: Record<string, { ce?: DhanOptionLeg; pe?: DhanOptionLeg }> };
  status?: string;
};

type DhanExpiryListResponse = { data?: string[]; status?: string };

function toLeg(leg: DhanOptionLeg | undefined): OptionLeg | null {
  if (!leg) return null;
  return {
    ltp: leg.last_price,
    oi: leg.oi,
    iv: leg.implied_volatility,
    volume: leg.volume,
    bid: leg.top_bid_price,
    ask: leg.top_ask_price,
    delta: leg.greeks.delta,
    gamma: leg.greeks.gamma,
    theta: leg.greeks.theta,
    vega: leg.greeks.vega,
  };
}

export async function getExpiryList(accountId: string, instrument: OptionChainInstrument): Promise<ExpiryListResult> {
  try {
    const creds = await getCreds(accountId);
    const { securityId, segment } = OPTION_CHAIN_INSTRUMENTS[instrument];
    const res = await dhanFetch<DhanExpiryListResponse>(creds, "/optionchain/expirylist", {
      method: "POST",
      body: JSON.stringify({ UnderlyingScrip: securityId, UnderlyingSeg: segment }),
    });

    if (!res.data || res.data.length === 0) {
      return { status: "unavailable", reason: "no expiries returned" };
    }
    return { status: "ok", expiries: res.data };
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : "network error" };
  }
}

// No fetch-level caching here (unlike lib/heatmap/*): the request carries a
// specific account's Dhan credentials, and Next's data cache keys on
// URL+body, not headers — caching would risk serving one account's option
// chain to a different account requesting the same instrument/expiry.
// Dhan documents a 3s-per-underlying/expiry rate limit; callers (the modal)
// should debounce instrument/expiry switches, not poll faster than that.
export async function getOptionChain(
  accountId: string,
  instrument: OptionChainInstrument,
  expiry: string,
): Promise<OptionChainResult> {
  try {
    const creds = await getCreds(accountId);
    const { securityId, segment } = OPTION_CHAIN_INSTRUMENTS[instrument];
    const res = await dhanFetch<DhanOptionChainResponse>(creds, "/optionchain", {
      method: "POST",
      body: JSON.stringify({ UnderlyingScrip: securityId, UnderlyingSeg: segment, Expiry: expiry }),
    });

    if (!res.data) {
      return { status: "unavailable", reason: "no option chain data returned" };
    }

    const strikes: OptionStrike[] = Object.entries(res.data.oc)
      .map(([strikeStr, legs]) => ({
        strike: Number(strikeStr),
        ce: toLeg(legs.ce),
        pe: toLeg(legs.pe),
      }))
      .sort((a, b) => a.strike - b.strike);

    if (strikes.length === 0) {
      return { status: "unavailable", reason: "empty strike ladder" };
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

    return { status: "ok", underlyingPrice: res.data.last_price, strikes, totals };
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : "network error" };
  }
}
