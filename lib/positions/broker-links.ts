import type { BrokerProvider } from "@/lib/runners/types";

/**
 * "Broker order" deep link per provider — the row action that opens the
 * position at the broker's own dashboard. None of these brokers expose a
 * public URL scheme that opens one specific order/position directly (Kite
 * and Dhan's web apps are session-scoped SPAs with no shareable order
 * permalink; Motilal and MetaApi/MT5 have no web dashboard at all), so this
 * links to each broker's own orders/positions page rather than inventing a
 * URL shape that doesn't exist. Providers with no real web dashboard return
 * null — the caller omits the button rather than linking somewhere wrong.
 */
export function getBrokerDashboardUrl(provider: BrokerProvider): string | null {
  switch (provider) {
    case "zerodha":
      return "https://kite.zerodha.com/orders";
    case "dhan":
      return "https://web.dhan.co/orders";
    case "motilal":
    case "metaapi":
      return null;
  }
}
