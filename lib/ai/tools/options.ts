import "server-only";
import { z } from "zod";
import { fetchOptionChain, fetchOptionChainExpiries, type OptionChainInstrument, type OptionStrike } from "@/lib/options/option-chain-actions";
import { ok, unavailable, type ToolResult } from "./shared";

export const getOptionChainSummaryInputSchema = z.object({
  instrument: z.enum(["NIFTY", "BANKNIFTY", "SENSEX"]),
  expiry: z.string().optional(), // defaults to the nearest available expiry
  strikeWindow: z.number().int().min(1).max(30).default(10), // strikes either side of ATM to include in the returned band
});
export type GetOptionChainSummaryInput = z.infer<typeof getOptionChainSummaryInputSchema>;

export type OptionChainSummary = {
  instrument: OptionChainInstrument;
  expiry: string;
  spot: number;
  pcr: number | null;
  maxPain: number | null;
  totalCallOi: number;
  totalPutOi: number;
  topOiStrikes: { side: "call" | "put"; strike: number; oi: number }[];
  ivSkew: number | null; // ATM put IV minus ATM call IV; positive = downside skew (puts pricier)
  strikes: { strike: number; callOi: number | null; callLtp: number | null; callIv: number | null; putOi: number | null; putLtp: number | null; putIv: number | null }[];
  asOf: string;
};

function computeMaxPain(strikes: OptionStrike[]): number | null {
  if (strikes.length === 0) return null;
  let best: { strike: number; pain: number } | null = null;
  for (const candidate of strikes) {
    let pain = 0;
    for (const row of strikes) {
      const callOi = row.ce?.oi ?? 0;
      const putOi = row.pe?.oi ?? 0;
      pain += callOi * Math.max(0, candidate.strike - row.strike);
      pain += putOi * Math.max(0, row.strike - candidate.strike);
    }
    if (!best || pain < best.pain) best = { strike: candidate.strike, pain };
  }
  return best?.strike ?? null;
}

function nearestStrikeTo(strikes: OptionStrike[], spot: number): OptionStrike | null {
  if (strikes.length === 0) return null;
  return strikes.reduce((closest, row) => (Math.abs(row.strike - spot) < Math.abs(closest.strike - spot) ? row : closest), strikes[0]);
}

function topOiStrikes(strikes: OptionStrike[], side: "call" | "put", limit = 3): { side: "call" | "put"; strike: number; oi: number }[] {
  return strikes
    .map((row) => ({ strike: row.strike, oi: (side === "call" ? row.ce?.oi : row.pe?.oi) ?? 0 }))
    .filter((row) => row.oi > 0)
    .sort((a, b) => b.oi - a.oi)
    .slice(0, limit)
    .map((row) => ({ side, ...row }));
}

/**
 * Never returns the raw chain — see PLAN_AI_COPILOT.md §2.1 "Options": a
 * full chain is tens of thousands of tokens. Returns the derived read (PCR,
 * max pain, OI walls, ATM IV skew — all computed here, not left for the
 * model to eyeball) plus a ±strikeWindow band around the at-the-money
 * strike. Session-scoped like the rest of the app's option-chain access —
 * fetchOptionChain/fetchOptionChainExpiries already enforce the workspace's
 * own `trading:view` permission and pick NSE-vs-Dhan source internally, so
 * this tool has no separate workspaceId/permission plumbing of its own.
 */
export async function getOptionChainSummary(input: GetOptionChainSummaryInput): Promise<ToolResult<OptionChainSummary>> {
  let expiry = input.expiry;
  if (!expiry) {
    const expiries = await fetchOptionChainExpiries(input.instrument);
    if (expiries.status === "unavailable") return unavailable(expiries.reason);
    if (expiries.expiries.length === 0) return unavailable(`no expiries available for ${input.instrument}`);
    expiry = expiries.expiries[0];
  }

  const chain = await fetchOptionChain(input.instrument, expiry);
  if (chain.status === "unavailable") return unavailable(chain.reason);

  const sorted = [...chain.strikes].sort((a, b) => a.strike - b.strike);
  const atm = nearestStrikeTo(sorted, chain.underlyingPrice);
  const atmIndex = atm ? sorted.findIndex((s) => s.strike === atm.strike) : -1;
  const band = atmIndex >= 0 ? sorted.slice(Math.max(0, atmIndex - input.strikeWindow), atmIndex + input.strikeWindow + 1) : sorted;

  const pcr = chain.totals.ceOi > 0 ? chain.totals.peOi / chain.totals.ceOi : null;
  const ivSkew = atm?.pe && atm?.ce ? atm.pe.iv - atm.ce.iv : null;

  return ok({
    instrument: input.instrument,
    expiry,
    spot: chain.underlyingPrice,
    pcr,
    maxPain: computeMaxPain(sorted),
    totalCallOi: chain.totals.ceOi,
    totalPutOi: chain.totals.peOi,
    topOiStrikes: [...topOiStrikes(sorted, "call"), ...topOiStrikes(sorted, "put")],
    ivSkew,
    strikes: band.map((row) => ({
      strike: row.strike,
      callOi: row.ce?.oi ?? null,
      callLtp: row.ce?.ltp ?? null,
      callIv: row.ce?.iv ?? null,
      putOi: row.pe?.oi ?? null,
      putLtp: row.pe?.ltp ?? null,
      putIv: row.pe?.iv ?? null,
    })),
    asOf: new Date().toISOString(),
  });
}
