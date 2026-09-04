"use client";

import { useTradingViewWidget } from "@/components/charts/tradingview-widget";

type SymbolEntry = { s: string; d: string };
type Tab = { title: string; symbols: SymbolEntry[] };

const DEFAULT_TABS: Tab[] = [
  {
    title: "Indices",
    symbols: [
      { s: "NSE:BANKNIFTY", d: "NIFTY BANK" },
      { s: "BSE:SENSEX", d: "SENSEX" },
      { s: "NSE:NIFTY", d: "NIFTY 50" },
    ],
  },
  {
    title: "Options Universe",
    symbols: [
      { s: "NSE:NIFTYIT", d: "NIFTY IT" },
      { s: "NSE:NIFTYNXT50", d: "NIFTYNXT50" },
      { s: "NSE:NIFTY100", d: "NIFTY 100" },
      { s: "NSE:NIFTY200", d: "NIFTY 200" },
      { s: "NSE:NIFTYMIDCAP150", d: "NIFTY MIDCAP ..." },
      { s: "NSE:NIFTYSMLCAP250", d: "NIFTY SMLCAP..." },
      { s: "NSE:NIFTYPHARMA", d: "NIFTY PHARMA" },
      { s: "NSE:NIFTYFMCG", d: "NIFTY FMCG" },
      { s: "NSE:NIFTYAUTO", d: "NIFTY AUTO" },
    ],
  },
  {
    title: "Commodities & FX",
    symbols: [
      { s: "OANDA:XAUUSD", d: "XAUUSD.r" },
      { s: "OANDA:XAGUSD", d: "XAGUSD.r" },
      { s: "COINBASE:BTCUSD", d: "BTCUSD" },
    ],
  },
];

export function TradingViewMarketOverview({ tabs = DEFAULT_TABS }: { tabs?: Tab[] }) {
  const containerRef = useTradingViewWidget(
    "https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js",
    {
      showChart: false,
      showSymbolLogo: false,
      showFloatingTooltip: false,
      isTransparent: false,
      locale: "en",
      width: "100%",
      height: "100%",
      tabs,
    },
  );

  return (
    <div
      className="tradingview-widget-container h-full overflow-hidden rounded-lg border"
      ref={containerRef}
    />
  );
}
