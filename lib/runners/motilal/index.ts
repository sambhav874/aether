import "server-only";
import { assertValidTotpSecret } from "@/lib/totp";
import { classifyIndianMarket } from "@/lib/runners/types";
import {
  motilalFetch,
  motilalLogin,
  motilalProfile,
  getCreds,
  type MotilalCreds,
} from "@/lib/runners/motilal/client";
import { resolveScrip, type MotilalExchange } from "@/lib/runners/motilal/instruments";
import type {
  BrokerRunner,
  Balance,
  ConnectResult,
  ExecutionResult,
  OrderRequest,
  Position,
} from "@/lib/runners/types";

export {
  BASE_URL,
  isMotilalAuthError,
  motilalLogin,
  motilalProfile,
  getMotilalLoginUrl,
  platformApiKey,
} from "@/lib/runners/motilal/client";
export type { MotilalCreds } from "@/lib/runners/motilal/client";
export { getScripQuote, getIndexQuote } from "@/lib/runners/motilal/market-quote";

/**
 * Margin summary comes back as a flat list of {srno, particulars, amount}
 * rows rather than named fields (LimitAPI.html), so the numbers we care
 * about are picked out by MO's stable srno codes, with the human-readable
 * `particulars` string as a fallback in case a code is renumbered.
 */
const SRNO = {
  availableCash: 102,
  availableFno: 103,
  availableCurrency: 104,
  availableCommodity: 105,
  availableOther: 106,
  cashDeposit: 201,
  nonCashDeposit: 220,
  mtm: 600,
  bpl: 700,
} as const;

type MarginRow = { srno: number; particulars: string; amount: number };

type MotilalPosition = {
  exchange: string;
  symboltoken: number;
  symbol: string;
  productname: string;
  buyquantity: number;
  buyamount: number;
  sellquantity: number;
  sellamount: number;
  LTP: number;
  marktomarket: number;
  bookedprofitloss: number;
  optiontype?: string;
  expirydate?: string;
  strikeprice?: number;
};

type MotilalHolding = {
  scripname: string;
  scripisinno: string;
  dpquantity: number;
  // Shares already pledged to MO as margin. They're what the margin
  // summary's "Non cash deposit" row is made of, so they must not be counted
  // a second time when valuing the demat book.
  collateralquantity?: number;
  buyavgprice: number;
  nsesymboltoken: number;
  bsescripcode: number;
};

function pick(rows: MarginRow[], srno: number, particularsMatch: string): number {
  const byNo = rows.find((r) => r.srno === srno);
  if (byNo) return Number(byNo.amount) || 0;
  const needle = particularsMatch.toLowerCase();
  const byName = rows.find((r) => r.particulars?.toLowerCase().includes(needle));
  return byName ? Number(byName.amount) || 0 : 0;
}

/** Which exchange a symbol trades on. MO keys orders and quotes per
 * exchange, and an F&O contract sent to "NSE" is rejected outright — the
 * old hardcoded "NSE" meant no options order could ever have been placed. */
function exchangeFor(symbol: string): MotilalExchange {
  return classifyIndianMarket(symbol) === "indian_options" ? "NSEFO" : "NSE";
}

async function fetchPositions(creds: MotilalCreds): Promise<MotilalPosition[]> {
  const res = await motilalFetch<{ data?: MotilalPosition[] }>(creds, "/rest/book/v1/getposition", {
    method: "POST",
    body: JSON.stringify({ clientcode: creds.clientCode }),
  });
  return res.data ?? [];
}

type LtpRow = { ltp: number };

/**
 * Marks demat holdings to market. MO's /getdpholding carries a cost price but
 * no LTP, so an unmarked holding contributes 0 P&L and 0 value — which is how
 * an account that's entirely long-term stock ends up reading as empty. LTP is
 * one call per scrip (MO has no batch quote endpoint) and comes back in paise.
 */
async function markHoldings(
  creds: MotilalCreds,
  holdings: MotilalHolding[],
): Promise<Map<string, number>> {
  const marks = new Map<string, number>();

  await Promise.all(
    holdings.map(async (h) => {
      const scripcode = h.nsesymboltoken || h.bsescripcode;
      if (!scripcode) return;
      try {
        const res = await motilalFetch<{ data?: LtpRow[] }>(creds, "/rest/report/v1/getltpdata", {
          method: "POST",
          body: JSON.stringify({
            clientcode: creds.clientCode,
            exchange: h.nsesymboltoken ? "NSE" : "BSE",
            scripcode,
          }),
        });
        const ltp = res.data?.[0]?.ltp;
        if (typeof ltp === "number") marks.set(h.scripisinno, ltp / 100);
      } catch {
        // A missing quote just means this row shows no P&L — never a reason
        // to fail the whole positions sync.
      }
    }),
  );

  return marks;
}

/**
 * Market value of the UNPLEDGED part of the demat book. Pledged shares are
 * already reported by the margin summary as "Non cash deposit", so only the
 * free quantity is added on top — otherwise collateral gets counted twice.
 */
async function unpledgedHoldingsValue(creds: MotilalCreds): Promise<number> {
  const res = await motilalFetch<{ data?: MotilalHolding[] }>(creds, "/rest/report/v1/getdpholding", {
    method: "POST",
    body: JSON.stringify({ clientcode: creds.clientCode }),
  });

  const holdings = (res.data ?? []).filter((h) => h.dpquantity > (h.collateralquantity ?? 0));
  if (holdings.length === 0) return 0;

  const marks = await markHoldings(creds, holdings);

  return holdings.reduce((total, h) => {
    const free = h.dpquantity - (h.collateralquantity ?? 0);
    const price = marks.get(h.scripisinno) ?? h.buyavgprice ?? 0;
    return total + price * free;
  }, 0);
}

function netQuantity(p: MotilalPosition): number {
  return (p.buyquantity ?? 0) - (p.sellquantity ?? 0);
}

/**
 * MO names a contract descriptively ("NIFTY 26-Dec-2024 CE 24000"), not in
 * the NSE ticker form classifyIndianMarket() keys off — so an option would
 * otherwise land in the Indian Equity module. The row's own optiontype
 * ("CE"/"PE", or "XX" for cash) and exchange are the reliable signal; the
 * symbol heuristic stays as the fallback.
 */
function marketFor(p: MotilalPosition): "indian_equity" | "indian_options" {
  const optionType = (p.optiontype ?? "").toUpperCase();
  if (optionType === "CE" || optionType === "PE") return "indian_options";
  if ((p.exchange ?? "").toUpperCase().endsWith("FO")) return "indian_options";
  return classifyIndianMarket(p.symbol);
}

export const motilalRunner: BrokerRunner = {
  provider: "motilal",

  // credentials = { apiKey, authToken, clientCode } — entered per-account
  // via Settings > Integrations. Order routing plus pull-based LTP quotes:
  // MO publishes no shared tick stream, unlike Dhan.
  async connectAccount(credentials): Promise<ConnectResult> {
    const creds: MotilalCreds = {
      // Blank when the deployment carries a vendor key — the transport falls
      // back to it, and storing it per-account would just duplicate the env.
      apiKey: credentials.apiKey || "",
      authToken: credentials.authToken,
      clientCode: credentials.clientCode,
      totpSecret: credentials.totpSecret || undefined,
      twoFa: credentials.twoFa || undefined,
      password: credentials.password || undefined,
    };

    if (creds.totpSecret) assertValidTotpSecret(creds.totpSecret);

    // MO's API login id is the MOFSL client code (e.g. "AA020"), never the
    // email address used to log into the website — an email here comes back
    // as MO2007 on every call, which is indistinguishable from an expired
    // token unless we catch it at connect time.
    if (creds.clientCode.includes("@")) {
      throw new Error(
        "Motilal client code looks like an email — use your MOFSL client code (the login ID shown on the MO API portal), not your website email.",
      );
    }

    if (!creds.authToken) {
      if (!creds.password) {
        throw new Error(
          "Enter your MOFSL password (for automatic daily tokens), or use “Log in with Motilal”, or paste a current auth token.",
        );
      }
      if (!creds.clientCode) {
        throw new Error("Enter your MOFSL client code to log in with a password.");
      }
      creds.authToken = await motilalLogin(creds);
      creds.authTokenIssuedAt = new Date().toISOString();
    }

    // The portal login returns a token and nothing else, so the account it
    // belongs to is read back off the token itself.
    if (!creds.clientCode) {
      creds.clientCode = (await motilalProfile(creds)).clientCode;
    }

    // Validates the credentials up front so a bad paste fails at connect time
    // rather than on the first sync.
    await motilalFetch(creds, "/rest/report/v1/getreportmarginsummary", {
      method: "POST",
      body: JSON.stringify({ clientcode: creds.clientCode }),
    });

    return {
      account: {
        externalAccountId: creds.clientCode,
        label: `Motilal Oswal ${creds.clientCode}`,
        provider: "motilal",
        status: "connected",
      },
      credentials: creds as unknown as Record<string, string>,
    };
  },

  async getBalance(accountId): Promise<Balance> {
    const creds = await getCreds(accountId);
    const res = await motilalFetch<{ data?: MarginRow[] }>(
      creds,
      "/rest/report/v1/getreportmarginsummary",
      { method: "POST", body: JSON.stringify({ clientcode: creds.clientCode }) },
    );

    const rows = res.data ?? [];
    if (rows.length === 0) {
      // Better to fail the sync (account flips to needs_reauth) than to
      // overwrite a real balance with a confident-looking 0.00.
      throw new Error("Motilal Oswal margin summary returned no rows");
    }

    const deposits =
      pick(rows, SRNO.cashDeposit, "cash deposit") + pick(rows, SRNO.nonCashDeposit, "non cash deposit");

    // The "Total Available Margin for <segment>" rows all report the SAME
    // pool viewed per segment (MO's own sample shows four identical
    // figures), so these are maxed, never summed — summing would inflate
    // the balance four-fold.
    const available = Math.max(
      pick(rows, SRNO.availableCash, "total available margin for cash"),
      pick(rows, SRNO.availableFno, "total available margin for fno"),
      pick(rows, SRNO.availableCurrency, "total available margin for curr"),
      pick(rows, SRNO.availableCommodity, "total available margin for comm"),
      pick(rows, SRNO.availableOther, "total available margin for other"),
    );

    // Same convention as the MetaAPI adapter: balance is settled cash,
    // equity is balance plus open P&L (MTM) and booked-but-unsettled P&L.
    const balance = deposits > 0 ? deposits : available;
    const mtm = pick(rows, SRNO.mtm, "total profit and loss(mtm)");
    const bpl = pick(rows, SRNO.bpl, "total profit and loss(bpl)");

    // Shares held for delivery are real account value that MO's margin
    // summary never reports — an investor account holding only stock reads as
    // a 0.00 balance without this. Best-effort: a quote outage must not fail
    // the whole balance sync.
    let holdingsValue = 0;
    try {
      holdingsValue = await unpledgedHoldingsValue(creds);
    } catch {
      // leave at 0 — cash figures above are still worth reporting
    }

    return {
      balance,
      equity: balance + mtm + bpl + holdingsValue,
      currency: "INR",
      asOf: new Date(),
    };
  },

  async getPositions(accountId): Promise<Position[]> {
    const creds = await getCreds(accountId);

    // /getposition covers intraday + F&O only. Delivery shares sitting in the
    // demat account never appear there, so holdings are merged in the same
    // way the Dhan adapter merges /holdings — otherwise a long-term equity
    // book reads as an empty account.
    const [live, holdings] = await Promise.all([
      fetchPositions(creds),
      motilalFetch<{ data?: MotilalHolding[] }>(creds, "/rest/report/v1/getdpholding", {
        method: "POST",
        body: JSON.stringify({ clientcode: creds.clientCode }),
      }).then((r) => r.data ?? []),
    ]);

    const positions: Position[] = live
      .filter((p) => netQuantity(p) !== 0)
      .map((p) => {
        const net = netQuantity(p);
        // MO reports gross buy/sell value, not an average price — the
        // average is the traded value over the traded quantity on whichever
        // side is currently open.
        const entryPrice =
          net > 0
            ? (p.buyamount ?? 0) / (p.buyquantity || 1)
            : (p.sellamount ?? 0) / (p.sellquantity || 1);

        return {
          externalPositionId: String(p.symboltoken),
          symbol: p.symbol,
          side: net < 0 ? ("short" as const) : ("long" as const),
          entryPrice,
          quantity: Math.abs(net),
          unrealizedPnl: p.marktomarket ?? 0,
          openedAt: new Date(),
          market: marketFor(p),
        };
      });

    const marks = await markHoldings(creds, holdings.filter((h) => h.dpquantity));

    for (const h of holdings) {
      if (!h.dpquantity) continue;
      const mark = marks.get(h.scripisinno);
      positions.push({
        // Prefixed so a demat holding can never collide with an intraday
        // position carrying the same token.
        externalPositionId: `holding:${h.nsesymboltoken || h.bsescripcode || h.scripisinno}`,
        symbol: h.scripname,
        side: "long",
        entryPrice: h.buyavgprice ?? 0,
        quantity: h.dpquantity,
        // Marked from MO's LTP endpoint; 0 only when the quote call failed.
        unrealizedPnl: mark !== undefined ? (mark - (h.buyavgprice ?? 0)) * h.dpquantity : 0,
        openedAt: new Date(),
        market: "indian_equity",
      });
    }

    return positions;
  },

  async placeOrder(accountId, order: OrderRequest): Promise<ExecutionResult> {
    const creds = await getCreds(accountId);

    try {
      const exchange = exchangeFor(order.symbol);
      const scrip = await resolveScrip(creds, order.symbol, exchange);

      // `quantityinlot` is exactly what it says — LOTS, not units
      // (OrdersAPI.html). Cash equity has marketlot 1 so the two coincide;
      // an F&O contract does not, and sending units there would multiply
      // the order size by the lot size.
      const lots = Math.max(1, Math.round(order.quantity / scrip.marketlot));

      const res = await motilalFetch<{ uniqueorderid?: string; message?: string }>(
        creds,
        "/rest/trans/v1/placeorder",
        {
          method: "POST",
          body: JSON.stringify({
            clientcode: creds.clientCode,
            exchange,
            symboltoken: scrip.scripcode,
            buyorsell: order.side.toUpperCase(),
            ordertype: order.price ? "LIMIT" : "MARKET",
            producttype: "NORMAL",
            orderduration: "DAY",
            price: order.price ?? 0,
            triggerprice: 0,
            quantityinlot: lots,
            disclosedquantity: 0,
            amoorder: "N",
          }),
        },
      );

      // motilalFetch already throws on status != SUCCESS; a missing order id
      // on a "successful" response still means nothing reached the exchange.
      if (!res.uniqueorderid) {
        return { status: "rejected", message: res.message ?? "order rejected — no order id returned" };
      }

      return {
        status: "executed",
        externalOrderId: res.uniqueorderid,
        message: "Order executed successfully",
      };
    } catch (error) {
      return {
        status: "rejected",
        message: error instanceof Error ? error.message : "Order rejected",
      };
    }
  },

  async closePosition(accountId, externalPositionId, quantity): Promise<ExecutionResult> {
    const creds = await getCreds(accountId);

    try {
      const live = await fetchPositions(creds);
      const position = live.find((p) => String(p.symboltoken) === externalPositionId);
      if (!position || netQuantity(position) === 0) {
        return { status: "rejected", message: "No open position found to close" };
      }

      const net = netQuantity(position);
      const closeQty = Math.min(quantity ?? Math.abs(net), Math.abs(net));
      const exchange = (position.exchange || exchangeFor(position.symbol)) as MotilalExchange;
      const scrip = await resolveScrip(creds, String(position.symboltoken), exchange);
      const lots = Math.max(1, Math.round(closeQty / (scrip.marketlot || 1)));

      const closeRes = await motilalFetch<{ uniqueorderid?: string; message?: string }>(
        creds,
        "/rest/trans/v1/placeorder",
        {
          method: "POST",
          body: JSON.stringify({
            clientcode: creds.clientCode,
            exchange,
            symboltoken: position.symboltoken,
            buyorsell: net > 0 ? "SELL" : "BUY",
            ordertype: "MARKET",
            // Exit under the same product the position was opened in —
            // closing a DELIVERY holding with a NORMAL order opens a fresh
            // intraday short instead of squaring off.
            producttype: position.productname || "NORMAL",
            orderduration: "DAY",
            price: 0,
            triggerprice: 0,
            quantityinlot: lots,
            disclosedquantity: 0,
            amoorder: "N",
          }),
        },
      );

      if (!closeRes.uniqueorderid) {
        return { status: "rejected", message: closeRes.message ?? "close rejected — no order id returned" };
      }

      return {
        status: "executed",
        externalOrderId: closeRes.uniqueorderid,
        message: "Position closed successfully",
      };
    } catch (error) {
      return {
        status: "rejected",
        message: error instanceof Error ? error.message : "Close rejected",
      };
    }
  },
};

type MotilalOrderBookEntry = { uniqueorderid: string; orderstatus: string };

/**
 * Only Motilal can cancel a resting order today (see the options
 * entry-limit-price doc), so this lives outside the shared BrokerRunner
 * interface rather than as a stub the other three adapters would have to
 * implement.
 */
export async function getMotilalOrderStatus(
  accountId: string,
  uniqueOrderId: string,
): Promise<"PENDING" | "COMPLETE" | "REJECTED" | "CANCELLED" | "UNKNOWN"> {
  const creds = await getCreds(accountId);
  // v2 — v1 of the order book is superseded in MO's current docs.
  const res = await motilalFetch<{ data?: MotilalOrderBookEntry[] }>(creds, "/rest/book/v2/getorderbook", {
    method: "POST",
    body: JSON.stringify({ clientcode: creds.clientCode }),
  });

  const order = (res.data ?? []).find((o) => o.uniqueorderid === uniqueOrderId);
  if (!order) return "UNKNOWN";
  const status = (order.orderstatus ?? "").toUpperCase();
  // MO's own status vocabulary: Unknown, Sent, Confirm, Cancel, Partial,
  // Traded, Rejected, Error (ParametersConstants.html) — "Traded" is the
  // filled state, and "Error" is a rejection by any other name.
  if (status.includes("TRADED") || status.includes("COMPLETE")) return "COMPLETE";
  if (status.includes("REJECT") || status.includes("ERROR")) return "REJECTED";
  if (status.includes("CANCEL")) return "CANCELLED";
  return "PENDING";
}

export async function cancelMotilalOrder(accountId: string, uniqueOrderId: string): Promise<{ ok: boolean; message: string }> {
  const creds = await getCreds(accountId);
  try {
    // A non-SUCCESS body throws inside motilalFetch — anything short of that
    // must NOT be recorded as cancelled locally: the order could still be
    // live and eligible to fill.
    await motilalFetch<{ status?: string; message?: string }>(creds, "/rest/trans/v1/cancelorder", {
      method: "POST",
      body: JSON.stringify({ clientcode: creds.clientCode, uniqueorderid: uniqueOrderId }),
    });
    return { ok: true, message: "cancelled" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "cancel failed" };
  }
}
