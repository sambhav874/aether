"use client";

import { useTradingViewWidget } from "@/components/charts/tradingview-widget";

export function TradingViewMiniChart({
  symbol,
  height = 220,
}: {
  symbol: string;
  height?: number;
}) {
  const containerRef = useTradingViewWidget(
    "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js",
    {
      symbol,
      dateRange: "1M",
      isTransparent: true,
      width: "100%",
      height,
      locale: "en",
    },
  );

  return (
    <div className="overflow-hidden rounded-lg border" style={{ height }}>
      <div className="tradingview-widget-container h-full" ref={containerRef} />
    </div>
  );
}
