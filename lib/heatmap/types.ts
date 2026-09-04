export type MarketHeatmapEntry = {
  symbol: string;
  name: string;
  price: number;
  value: number;
  changePct: number | null;
};

export type MarketHeatmapResult =
  | { status: "ok"; entries: MarketHeatmapEntry[] }
  | { status: "unavailable"; reason: string };
