import type { Market } from "@/db/schema";

export type PositionRow = {
  id: string;
  accountId: string;
  strategyId: string | null;
  market: Market;
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  filledQuantity: number | null;
  status: "open" | "closed";
  closeReason: string | null;
  pnl: number | null;
  rr: number | null;
  sl: number | null;
  strategyLabel: string | null;
  accountLabel: string;
  provider: string;
  /** The denominating currency of the broker account this position sits on.
   * Not a property of the market — one workspace can hold both INR- and
   * USD-denominated MT5 accounts, so a per-market constant would mislabel
   * real money. */
  currency: "USD" | "INR";
  basketName: string | null;
  openedAt: Date;
  closedAt: Date | null;
};

export type PositionKpis = {
  openPositions: number;
  todaysTrades: number;
  realizedPnl: number;
  unrealizedPnl: number;
  winRate: number | null;
  averageR: number | null;
  maxDrawdown: number;
  totalTrades: number;
};

export type MarketConfig = {
  market: Market;
  title: string;
  currency: "USD" | "INR";
};
