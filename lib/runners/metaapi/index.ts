import "server-only";
// The package's top-level "." export conditionally resolves `import` to its
// browser bundle (dists/esm-web, references `window`) — aliased in
// next.config.ts (turbopack.resolveAlias) to the Node-safe CJS build.
import MetaApi from "metaapi.cloud-sdk";
import { getStoredCredentials } from "@/lib/runners/credentials";
import type {
  BrokerRunner,
  Balance,
  ConnectResult,
  ExecutionResult,
  OrderRequest,
  Position,
  TickHandler,
  Unsubscribe,
} from "@/lib/runners/types";

function getClient(): MetaApi {
  const token = process.env.METAAPI_TOKEN;
  if (!token) {
    throw new Error("METAAPI_TOKEN is not set — required for the MetaAPI runner.");
  }
  return new MetaApi(token, { application: "monarch" });
}

export const metaapiRunner: BrokerRunner = {
  provider: "metaapi",

  async connectAccount(credentials): Promise<ConnectResult> {
    const { login, password, server, name } = credentials;
    const api = getClient();

    // The connect form's Label field is optional, so `name` arrives as "" when
    // it's left blank — and MetaAPI rejects an empty name outright ("Path `name`
    // is required"). Fall back to the login, then to a constant, so the payload
    // can never carry a blank.
    const accountName = name?.trim() || `MT5 ${login ?? ""}`.trim() || "MT5 account";

    const account = await api.metatraderAccountApi.createAccount({
      login,
      password,
      server,
      name: accountName,
      magic: 0,
      platform: "mt5",
    } as never);

    await account.deploy();
    await account.waitConnected();

    return {
      account: {
        externalAccountId: account.id,
        label: account.name,
        provider: "metaapi",
        status: "connected",
      },
      // MetaAPI holds the MT5 login itself once the account is provisioned —
      // nothing further needs to be re-presented on later calls, but we still
      // persist the login/server for display and reconnect diagnostics.
      credentials: { login, server },
    };
  },

  async getBalance(accountId): Promise<Balance> {
    const { externalAccountId } = await getStoredCredentials(accountId);
    const api = getClient();
    const account = await api.metatraderAccountApi.getAccount(externalAccountId);
    const connection = account.getRPCConnection();
    await connection.connect();
    await connection.waitSynchronized();

    const info = await connection.getAccountInformation();
    return {
      balance: info.balance,
      equity: info.equity,
      currency: info.currency,
      asOf: new Date(),
      // MetaAPI's accountInformation carries far more than balance/equity, and
      // the settings UI shows all of it — see AccountDetails. Passing it through
      // here is what keeps that panel free of a second round trip.
      details: {
        broker: info.broker,
        server: info.server,
        login: info.login != null ? String(info.login) : undefined,
        holder: info.name?.trim(),
        leverage: info.leverage,
        credit: info.credit,
        margin: info.margin,
        freeMargin: info.freeMargin,
        marginMode: info.marginMode,
        accountType: info.type,
        platform: info.platform,
        tradeAllowed: info.tradeAllowed,
        investorMode: info.investorMode,
        currencyDigits: info.currencyDigits,
      },
    };
  },

  async getPositions(accountId): Promise<Position[]> {
    const { externalAccountId } = await getStoredCredentials(accountId);
    const api = getClient();
    const account = await api.metatraderAccountApi.getAccount(externalAccountId);
    const connection = account.getRPCConnection();
    await connection.connect();
    await connection.waitSynchronized();

    const positions = await connection.getPositions();
    return positions.map((p: Record<string, unknown>) => ({
      externalPositionId: String(p.id),
      symbol: String(p.symbol),
      side: p.type === "POSITION_TYPE_SELL" ? "short" : "long",
      entryPrice: Number(p.openPrice),
      quantity: Number(p.volume),
      unrealizedPnl: Number(p.profit ?? 0),
      openedAt: new Date(String(p.time)),
      market: "forex",
    }));
  },

  async placeOrder(accountId, order: OrderRequest): Promise<ExecutionResult> {
    const { externalAccountId } = await getStoredCredentials(accountId);
    const api = getClient();
    const account = await api.metatraderAccountApi.getAccount(externalAccountId);
    const connection = account.getRPCConnection();
    await connection.connect();
    await connection.waitSynchronized();

    try {
      const result =
        order.side === "buy"
          ? await connection.createMarketBuyOrder(
              order.symbol,
              order.quantity,
              order.stopLoss,
              order.takeProfit,
            )
          : await connection.createMarketSellOrder(
              order.symbol,
              order.quantity,
              order.stopLoss,
              order.takeProfit,
            );

      return {
        status: "executed",
        externalOrderId: String(result.orderId ?? result.positionId ?? ""),
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
    const { externalAccountId } = await getStoredCredentials(accountId);
    const api = getClient();
    const account = await api.metatraderAccountApi.getAccount(externalAccountId);
    const connection = account.getRPCConnection();
    await connection.connect();
    await connection.waitSynchronized();

    try {
      // MetaAPI's trade connection supports a native partial close via
      // closePositionPartially — unlike the other adapters, no "place an
      // opposite order for less" workaround is needed here. Closing with the
      // position's full remaining volume behaves the same as a full close.
      if (quantity) {
        await connection.closePositionPartially(externalPositionId, quantity, {});
      } else {
        await connection.closePosition(externalPositionId, {});
      }
      return {
        status: "executed",
        externalOrderId: externalPositionId,
        message: "Position closed successfully",
      };
    } catch (error) {
      return {
        status: "rejected",
        message: error instanceof Error ? error.message : "Close rejected",
      };
    }
  },

  streamTicks(symbols: string[], onTick: TickHandler): Unsubscribe {
    let cancelled = false;

    (async () => {
      const accountId = process.env.METAAPI_STREAM_ACCOUNT_ID;
      if (!accountId) return;

      const api = getClient();
      const account = await api.metatraderAccountApi.getAccount(accountId);
      const connection = account.getStreamingConnection();
      await connection.connect();
      await connection.waitSynchronized();

      for (const symbol of symbols) {
        await connection.subscribeToMarketData(symbol, []);
      }

      const poll = setInterval(() => {
        if (cancelled) {
          clearInterval(poll);
          return;
        }
        for (const symbol of symbols) {
          const price = connection.terminalState.price(symbol);
          if (price) {
            onTick({
              symbol,
              bid: price.bid,
              ask: price.ask,
              time: new Date(),
            });
          }
        }
      }, 1000);
    })();

    return () => {
      cancelled = true;
    };
  },
};
