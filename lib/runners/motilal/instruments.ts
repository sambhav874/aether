import "server-only";
import { motilalFetch, type MotilalCreds } from "@/lib/runners/motilal/client";

/**
 * Motilal's trading + quote endpoints are keyed on a numeric `scripcode`
 * (called `symboltoken` on the order/position side), never on a trading
 * symbol — unlike Zerodha, which accepts "NSE:RELIANCE" directly. The scrip
 * master is the only mapping MO publishes, so every symbol we route has to
 * be resolved through it first.
 *
 * Verified against
 * invest.motilaloswal.com/OpenApi/Dashboard/API_Documentation/MasterDataAPI.html
 * (POST /rest/report/v1/getscripsbyexchangename).
 */
export type MotilalExchange = "NSE" | "BSE" | "NSEFO" | "NSECD" | "MCX";

type MotilalScrip = {
  scripcode: number;
  scripname: string;
  scripshortname: string;
  marketlot: number;
  instrumentname: string;
  expirydate?: string;
  strikeprice?: number;
  optiontype?: string;
};

type ScripMasterResponse = { data?: MotilalScrip[] };

// The NSEFO master is ~100k rows and MO regenerates it once a day, so it's
// cached per process rather than re-downloaded per order. Half a day keeps
// same-session strikes resolvable without ever serving a stale expiry list
// into the next trading day.
const MASTER_TTL_MS = 12 * 60 * 60 * 1000;

type CacheEntry = { fetchedAt: number; byKey: Map<string, MotilalScrip> };
const masterCache = new Map<MotilalExchange, CacheEntry>();

/** MO's scripnames carry spaces and an " EQ"/" BE" series suffix ("RELAXO EQ"),
 * while signals arrive as bare symbols ("RELAXO") — normalising both sides to
 * uppercase-alphanumeric makes the two forms comparable. */
function normalize(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function loadMaster(creds: MotilalCreds, exchange: MotilalExchange): Promise<CacheEntry> {
  const cached = masterCache.get(exchange);
  if (cached && Date.now() - cached.fetchedAt < MASTER_TTL_MS) return cached;

  const res = await motilalFetch<ScripMasterResponse>(creds, "/rest/report/v1/getscripsbyexchangename", {
    method: "POST",
    body: JSON.stringify({ exchangename: exchange }),
  });

  const byKey = new Map<string, MotilalScrip>();
  for (const scrip of res.data ?? []) {
    // Both the full name and the short name are indexed: F&O rows only carry
    // a descriptive scripname ("NIFTY 26-Dec-2024 CE 21500"), cash rows carry
    // both, and a signal can legitimately quote either form.
    for (const key of [scrip.scripname, scrip.scripshortname]) {
      if (!key) continue;
      const normalized = normalize(key);
      // First row wins — the master lists the same short name once per
      // series, and the EQ series sorts ahead of the illiquid ones.
      if (!byKey.has(normalized)) byKey.set(normalized, scrip);
    }
  }

  const entry: CacheEntry = { fetchedAt: Date.now(), byKey };
  masterCache.set(exchange, entry);
  return entry;
}

export type ResolvedScrip = { scripcode: number; exchange: MotilalExchange; marketlot: number; scripname: string };

/**
 * Resolves a trading symbol to MO's numeric scripcode. `symbol` may also be
 * given as a bare numeric token (what our positions table stores as
 * externalPositionId), in which case it's used as-is — that's the path a
 * close/exit takes, where we already know the token MO gave us.
 */
export async function resolveScrip(
  creds: MotilalCreds,
  symbol: string,
  exchange: MotilalExchange,
): Promise<ResolvedScrip> {
  if (/^\d+$/.test(symbol)) {
    return { scripcode: Number(symbol), exchange, marketlot: 1, scripname: symbol };
  }

  const master = await loadMaster(creds, exchange);
  const key = normalize(symbol);
  const hit = master.byKey.get(key) ?? master.byKey.get(`${key}EQ`);

  if (!hit) {
    throw new Error(`Motilal Oswal: symbol "${symbol}" not found in the ${exchange} scrip master`);
  }

  return {
    scripcode: hit.scripcode,
    exchange,
    marketlot: hit.marketlot || 1,
    scripname: hit.scripname,
  };
}

/** Index rows live in the cash master alongside equities, so an index LTP
 * lookup ("SENSEX", "NIFTY 50") resolves through the same path. */
export async function resolveIndexScrip(
  creds: MotilalCreds,
  name: string,
  exchange: "NSE" | "BSE",
): Promise<ResolvedScrip> {
  return resolveScrip(creds, name, exchange);
}
