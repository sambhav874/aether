export type BrokerProvider = "metaapi" | "zerodha" | "dhan" | "motilal";

export type Market = "forex" | "indian_options" | "indian_equity";

export type ConnectionStatus =
  | "connected"
  | "disconnected"
  | "needs_reauth"
  | "syncing"
  | "whitelist_pending";

export type BrokerAccount = {
  externalAccountId: string;
  label: string;
  provider: BrokerProvider;
  status: ConnectionStatus;
};

/**
 * Everything a broker reports about an account beyond the headline numbers.
 * Every field is optional: adapters fill in what their API actually returns,
 * and the UI renders only what is present rather than showing "—" rows for
 * fields a given broker never had.
 */
export type AccountDetails = {
  /** Broker company name as the broker reports it, e.g. "AdamFxCapitals Ltd." */
  broker?: string;
  /** Trading server, e.g. "AdamFxCapitals-Server". */
  server?: string;
  /** Broker-side account number / login. */
  login?: string;
  /** Account holder as named at the broker — often differs from our label. */
  holder?: string;
  /** Leverage denominator: 400 means 1:400. */
  leverage?: number;
  credit?: number;
  margin?: number;
  freeMargin?: number;
  /** e.g. "ACCOUNT_MARGIN_MODE_RETAIL_HEDGING" */
  marginMode?: string;
  /** Real vs demo, as the broker classifies it. */
  accountType?: string;
  platform?: string;
  /** False when the broker has trading disabled on the account. */
  tradeAllowed?: boolean;
  /** True when the credentials are read-only (investor password). */
  investorMode?: boolean;
  /** Decimal places the broker uses for this account's currency. */
  currencyDigits?: number;
};

export type Balance = {
  balance: number;
  equity: number;
  currency: string;
  asOf: Date;
  details?: AccountDetails;
};

export type Position = {
  externalPositionId: string;
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  quantity: number;
  unrealizedPnl: number;
  openedAt: Date;
  /** Which module this holding belongs to on our side — forex is only ever
   * MetaAPI; for the Indian brokers it's derived from the trading symbol
   * (see classifyIndianMarket). */
  market: Market;
};

// F&O trading symbols on NSE/BSE always end in an expiry+strike+CE/PE
// suffix (e.g. "NIFTY24DEC21500CE") — a plain equity symbol never does.
// Used to classify a broker position/holding we didn't open ourselves,
// where there's no strategy context to say which module it belongs to.
export function classifyIndianMarket(symbol: string): "indian_equity" | "indian_options" {
  return /\d+(CE|PE)$/.test(symbol) ? "indian_options" : "indian_equity";
}

export type OrderRequest = {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
};

export type ExecutionResult =
  | { status: "executed"; externalOrderId: string; message: string }
  | { status: "rejected"; message: string };

export type TickHandler = (tick: { symbol: string; bid: number; ask: number; time: Date }) => void;
export type Unsubscribe = () => void;

/**
 * Every broker adapter (MetaAPI, Zerodha, Dhan, Motilal) implements this
 * interface. Callers (strategy engine, order dispatch panel, sync job)
 * depend only on this contract, never on a specific broker's SDK —
 * see components/dashboard/README-less plan doc, Phase 1 "Broker-Runner
 * Abstraction" for the rationale.
 */
export type ConnectResult = {
  account: BrokerAccount;
  /**
   * Credentials/tokens to persist encrypted against this account (e.g.
   * Zerodha's daily access_token). The runner itself never touches the
   * database — callers persist this via lib/runners/credentials.ts.
   */
  credentials: Record<string, string>;
};

export interface BrokerRunner {
  readonly provider: BrokerProvider;

  connectAccount(credentials: Record<string, string>): Promise<ConnectResult>;

  /**
   * `accountId` here is always OUR internal broker_accounts.id (a
   * workspace-scoped UUID) — never the broker's own external account id.
   * The same external account (e.g. one real Zerodha client code) can be
   * connected into more than one workspace, so external ids alone aren't
   * unique enough to key a credential lookup on; see lib/runners/credentials.ts.
   */
  getBalance(accountId: string): Promise<Balance>;
  getPositions(accountId: string): Promise<Position[]>;
  placeOrder(accountId: string, order: OrderRequest): Promise<ExecutionResult>;
  /**
   * `quantity` omitted (or >= the position's full size) closes the whole
   * position; a smaller value books a partial close. Every adapter
   * implements this the same way it implements a full close — an opposite
   * order for the given size — except MetaAPI, which has a native partial
   * close on the trade connection.
   */
  closePosition(accountId: string, externalPositionId: string, quantity?: number): Promise<ExecutionResult>;

  /** Not all brokers support push ticks (e.g. Motilal is order-routing only). */
  streamTicks?(symbols: string[], onTick: TickHandler): Unsubscribe;
}
