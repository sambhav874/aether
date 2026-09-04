"use client";

import * as React from "react";
import { useTheme } from "next-themes";

/**
 * Shared mount logic for TradingView's official embed widgets. Each widget
 * type is a <script src="https://s3.tradingview.com/external-embedding/embed-widget-*.js">
 * with its config as the script's JSON text content — TradingView reads it
 * from the DOM at load time, so the whole container is torn down and
 * rebuilt (not just re-configured) whenever the theme or config changes.
 */
export function useTradingViewWidget(scriptSrc: string, config: Record<string, unknown>) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const mounted = useMounted();

  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const configKey = JSON.stringify({ ...config, theme });

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || !mounted) return;

    container.innerHTML = "";
    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    container.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = scriptSrc;
    script.async = true;
    script.text = JSON.stringify({ ...config, theme, colorTheme: theme });
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- configKey captures every dependency
  }, [scriptSrc, configKey, mounted]);

  return containerRef;
}

function useMounted() {
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  return mounted;
}
