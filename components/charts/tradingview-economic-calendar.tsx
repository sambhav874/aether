"use client";

import { useTradingViewWidget } from "@/components/charts/tradingview-widget";

export function TradingViewEconomicCalendar() {
  const containerRef = useTradingViewWidget(
    "https://s3.tradingview.com/external-embedding/embed-widget-events.js",
    {
      width: "100%",
      height: "100%",
      isTransparent: false,
      locale: "en",
      importanceFilter: "-1,0,1",
      countryFilter: "in,us,gb,cn,jp,eu",
    },
  );

  return (
    <div className="tradingview-widget-container h-full rounded-lg border" ref={containerRef} />
  );
}
