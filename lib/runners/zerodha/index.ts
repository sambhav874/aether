import "server-only";
import { KiteConnect } from "kiteconnect";
import type { Connect } from "kiteconnect";
import { getStoredCredentials } from "@/lib/runners/credentials";
import { classifyIndianMarket } from "@/lib/runners/types";
import type {
  BrokerRunner,
  Balance,
  ConnectResult,
  ExecutionResult,
  OrderRequest,
  Position,
} from "@/lib/runners/types";

function getApiKey(): string {
  const key = process.env.ZERODHA_API_KEY;
  if (!key) throw new Error("ZERODHA_API_KEY is not set — required for the Zerodha runner.");
  return key;
}

function getApiSecret(): string {
  const secret = process.env.ZERODHA_API_SECRET;
  if (!secret) throw new Error("ZERODHA_API_SECRET is not set — required for the Zerodha runner.");
  return secret;
}

/** Where users are sent to authorize this app against their Zerodha login. */
export function getZerodhaLoginUrl(): string {
  return new KiteConnect({ api_key: getApiKey() }).getLoginURL();
}

async function getAuthenticatedClient(accountId: string): Promise<Connect> {
  const { credentials } = await getStoredCredentials(accountId);
  const kc = new KiteConnect({ api_key: getApiKey() });
  kc.setAccessToken(credentials.accessToken);
  return kc;
}

export const zerodhaRunner: BrokerRunner = {
  provider: "zerodha",

  // credentials = { requestToken } from the Kite Connect login redirect —
  // access_token expires at ~7:30am IST daily, so this same flow is re-run
  // whenever the account's status flips to "needs_reauth".
  async connectAccount(credentials): Promise<ConnectResult> {
    const kc = new KiteConnect({ api_key: getApiKey() });
    const session = await kc.generateSession(credentials.requestToken, getApiSecret());
    kc.setAccessToken(session.access_token);
    const profile = await kc.getProfile();

    return {
      account: {
        externalAccountId: session.user_id,
        label: profile.user_name,
        provider: "zerodha",
        status: "connected",
      },
      credentials: { accessToken: session.access_token },
    };
  },

  async getBalance(accountId): Promise<Balance> {
    const kc = await getAuthenticatedClient(accountId);
    const margins = await kc.getMargins("equity");
    return {
      balance: margins.equity?.available.cash ?? 0,
      equity: margins.equity?.net ?? 0,
      currency: "INR",
      asOf: new Date(),
    };
  },

  async getPositions(accountId): Promise<Position[]> {
    const kc = await getAuthenticatedClient(accountId);
    const [{ net }, holdings] = await Promise.all([kc.getPositions(), kc.getHoldings()]);

    const openPositions: Position[] = net
      .filter((p) => p.quantity !== 0)
      .map((p) => ({
        externalPositionId: `${p.exchange}:${p.tradingsymbol}:${p.product}`,
        symbol: p.tradingsymbol,
        side: p.quantity < 0 ? "short" : "long",
        entryPrice: p.average_price,
        quantity: Math.abs(p.quantity),
        unrealizedPnl: p.unrealised,
        openedAt: new Date(),
        market: classifyIndianMarket(p.tradingsymbol),
      }));

    // Delivery (T+1) equity holdings — never appear in positions.net, that
    // API only covers intraday + F&O carry-forward.
    const deliveryHoldings: Position[] = holdings
      .filter((h) => h.quantity !== 0)
      .map((h) => ({
        externalPositionId: `holding:${h.exchange}:${h.tradingsymbol}`,
        symbol: h.tradingsymbol,
        side: "long",
        entryPrice: h.average_price,
        quantity: h.quantity,
        unrealizedPnl: h.pnl,
        openedAt: new Date(),
        market: "indian_equity",
      }));

    return [...openPositions, ...deliveryHoldings];
  },

  async placeOrder(accountId, order: OrderRequest): Promise<ExecutionResult> {
    const kc = await getAuthenticatedClient(accountId);
    try {
      const [exchange, tradingsymbol] = order.symbol.includes(":")
        ? order.symbol.split(":")
        : ["NSE", order.symbol];

      const result = await kc.placeOrder(kc.VARIETY_REGULAR, {
        exchange: exchange as never,
        tradingsymbol,
        transaction_type:
          order.side === "buy" ? kc.TRANSACTION_TYPE_BUY : kc.TRANSACTION_TYPE_SELL,
        quantity: order.quantity,
        product: kc.PRODUCT_MIS,
        order_type: order.price ? kc.ORDER_TYPE_LIMIT : kc.ORDER_TYPE_MARKET,
        price: order.price,
      });

      return {
        status: "executed",
        externalOrderId: result.order_id,
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
    const kc = await getAuthenticatedClient(accountId);
    const [exchange, tradingsymbol, product] = externalPositionId.split(":");
    const { net } = await kc.getPositions();
    const position = net.find(
      (p) => p.exchange === exchange && p.tradingsymbol === tradingsymbol && p.product === product,
    );

    if (!position || position.quantity === 0) {
      return { status: "rejected", message: "No open position found to close" };
    }

    const closeQty = Math.min(quantity ?? Math.abs(position.quantity), Math.abs(position.quantity));

    try {
      const result = await kc.placeOrder(kc.VARIETY_REGULAR, {
        exchange: exchange as never,
        tradingsymbol,
        transaction_type:
          position.quantity > 0 ? kc.TRANSACTION_TYPE_SELL : kc.TRANSACTION_TYPE_BUY,
        quantity: closeQty,
        product: product as never,
        order_type: kc.ORDER_TYPE_MARKET,
      });

      return {
        status: "executed",
        externalOrderId: result.order_id,
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
