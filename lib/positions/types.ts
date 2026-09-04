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
