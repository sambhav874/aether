"use client";

import { useTradingViewWidget } from "@/components/charts/tradingview-widget";

const DEFAULT_SYMBOLS = [
  { proName: "FOREXCOM:SPXUSD", title: "S&P 500" },
  { proName: "FX:EURUSD", title: "EUR/USD" },
  { proName: "FX:GBPUSD", title: "GBP/USD" },
  { proName: "FX:USDJPY", title: "USD/JPY" },
  { proName: "OANDA:XAUUSD", title: "Gold" },
  { proName: "NSE:NIFTY", title: "NIFTY 50" },
  { proName: "BSE:SENSEX", title: "SENSEX" },
];

export function TradingViewTickerTape({
  symbols = DEFAULT_SYMBOLS,
}: {
  symbols?: { proName: string; title: string }[];
}) {
  const containerRef = useTradingViewWidget(
    "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js",
    {
      symbols,
      showSymbolLogo: true,
      isTransparent: true,
      displayMode: "adaptive",
      locale: "en",
    },
  );

  return <div className="tradingview-widget-container rounded-lg border" ref={containerRef} />;
}
