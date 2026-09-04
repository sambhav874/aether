import "server-only";
import { getStoredCredentials } from "@/lib/runners/credentials";
import { assertValidTotpSecret } from "@/lib/totp";
import { classifyIndianMarket } from "@/lib/runners/types";
import type {
  BrokerRunner,
  Balance,
  ConnectResult,
  ExecutionResult,
  OrderRequest,
  Position,
} from "@/lib/runners/types";

export const BASE_URL = "https://api.dhan.co/v2";

export type DhanCreds = {
  accessToken: string;
  dhanClientId: string;
  // Optional — DhanHQ has no public API to mint an access token from a PIN
  // + TOTP, so these aren't used to authenticate today. They're stored so a
  // background job (or the bridge-runner) can drive the browser login flow
  // to refresh the 24h token automatically once that path is verified,
  // instead of every needs_reauth requiring a human to paste a fresh one.
  pin?: string;
  totpSecret?: string;
};

export async function dhanFetch<T>(
  creds: DhanCreds,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "access-token": creds.accessToken,
      "dhanClientId": creds.dhanClientId,
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Dhan API ${path} failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<T>;
}

export async function getCreds(accountId: string): Promise<DhanCreds> {
  const { credentials } = await getStoredCredentials(accountId);
  return credentials as unknown as DhanCreds;
}

type DhanFundLimit = {
  availabelBalance: number;
  sodLimit: number;
  collateralAmount: number;
  utilizedAmount: number;
};

type DhanPosition = {
  securityId: string;
  tradingSymbol: string;
  netQty: number;
  buyAvg: number;
  unrealizedProfit: number;
};

// Delivery equity shares, distinct from /positions (intraday + F&O only) —
// a share bought for delivery and held overnight shows up here, never in
// /positions, so getPositions has to merge both to reflect what's actually
// in the account.
type DhanHolding = {
  securityId: string;
  tradingSymbol: string;
  totalQty: number;
  avgCostPrice: number;
};

export const dhanRunner: BrokerRunner = {
  provider: "dhan",

  // credentials = { accessToken, dhanClientId } — the 24h token generated
  // from web.dhan.co > Access DhanHQ APIs (or the OAuth/TOTP flow), entered
  // by the account owner via Settings > Integrations.
  async connectAccount(credentials): Promise<ConnectResult> {
    const creds: DhanCreds = {
      accessToken: credentials.accessToken,
      dhanClientId: credentials.dhanClientId,
      pin: credentials.pin || undefined,
      totpSecret: credentials.totpSecret || undefined,
    };

    if (creds.totpSecret) assertValidTotpSecret(creds.totpSecret);

    // Validates the token up front so a bad paste fails at connect time,
    // not on the first sync.
    await dhanFetch<DhanFundLimit>(creds, "/fundlimit", { method: "GET" });

    return {
      account: {
        externalAccountId: creds.dhanClientId,
        label: `Dhan ${creds.dhanClientId}`,
        provider: "dhan",
        status: "connected",
      },
      credentials: creds as unknown as Record<string, string>,
    };
  },

  async getBalance(accountId): Promise<Balance> {
    const creds = await getCreds(accountId);
    const funds = await dhanFetch<DhanFundLimit>(creds, "/fundlimit", { method: "GET" });

    return {
      balance: funds.availabelBalance,
      equity: funds.availabelBalance + funds.collateralAmount - funds.utilizedAmount,
      currency: "INR",
      asOf: new Date(),
    };
  },

  async getPositions(accountId): Promise<Position[]> {
    const creds = await getCreds(accountId);
    const [positions, holdings] = await Promise.all([
      dhanFetch<DhanPosition[]>(creds, "/positions", { method: "GET" }),
      dhanFetch<DhanHolding[]>(creds, "/holdings", { method: "GET" }),
    ]);

    const openPositions: Position[] = positions
      .filter((p) => p.netQty !== 0)
      .map((p) => ({
        externalPositionId: p.securityId,
        symbol: p.tradingSymbol,
        side: p.netQty < 0 ? "short" : "long",
        entryPrice: p.buyAvg,
        quantity: Math.abs(p.netQty),
        unrealizedPnl: p.unrealizedProfit,
        openedAt: new Date(),
        market: classifyIndianMarket(p.tradingSymbol),
      }));

    const deliveryHoldings: Position[] = holdings
      .filter((h) => h.totalQty !== 0)
      .map((h) => ({
        externalPositionId: `holding:${h.securityId}`,
        symbol: h.tradingSymbol,
        side: "long",
        entryPrice: h.avgCostPrice,
        quantity: h.totalQty,
        unrealizedPnl: 0,
        openedAt: new Date(),
        market: "indian_equity",
      }));

    return [...openPositions, ...deliveryHoldings];
  },

  async placeOrder(accountId, order: OrderRequest): Promise<ExecutionResult> {
    const creds = await getCreds(accountId);

    try {
      const result = await dhanFetch<{ orderId: string }>(creds, "/orders", {
        method: "POST",
        body: JSON.stringify({
          dhanClientId: creds.dhanClientId,
          transactionType: order.side.toUpperCase(),
          exchangeSegment: "NSE_EQ",
          productType: "INTRADAY",
          orderType: order.price ? "LIMIT" : "MARKET",
          validity: "DAY",
          securityId: order.symbol,
          quantity: String(order.quantity),
          price: order.price ? String(order.price) : "",
        }),
      });

      return {
        status: "executed",
        externalOrderId: result.orderId,
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
    const positions = await dhanFetch<DhanPosition[]>(creds, "/positions", { method: "GET" });
    const position = positions.find((p) => p.securityId === externalPositionId);

    if (!position || position.netQty === 0) {
      return { status: "rejected", message: "No open position found to close" };
    }

    const closeQty = Math.min(quantity ?? Math.abs(position.netQty), Math.abs(position.netQty));

    try {
      const result = await dhanFetch<{ orderId: string }>(creds, "/orders", {
        method: "POST",
        body: JSON.stringify({
          dhanClientId: creds.dhanClientId,
          transactionType: position.netQty > 0 ? "SELL" : "BUY",
          exchangeSegment: "NSE_EQ",
          productType: "INTRADAY",
          orderType: "MARKET",
          validity: "DAY",
          securityId: position.securityId,
          quantity: String(closeQty),
        }),
      });

      return {
        status: "executed",
        externalOrderId: result.orderId,
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
