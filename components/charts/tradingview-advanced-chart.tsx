"use client";

import { useTradingViewWidget } from "@/components/charts/tradingview-widget";

export function TradingViewAdvancedChart({
  symbol = "FX:EURUSD",
  height = 500,
}: {
  symbol?: string;
  height?: number;
}) {
  const containerRef = useTradingViewWidget(
    "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js",
    {
      width: "100%",
      height,
      symbol,
      interval: "60",
      timezone: "Etc/UTC",
      style: "1",
      locale: "en",
      allow_symbol_change: true,
      support_host: "https://www.tradingview.com",
    },
  );

  return (
    <div className="overflow-hidden rounded-lg border" style={{ height }}>
      <div className="tradingview-widget-container h-full" ref={containerRef} />
    </div>
  );
}
