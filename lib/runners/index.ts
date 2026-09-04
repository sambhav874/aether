import "server-only";
import type { BrokerProvider, BrokerRunner } from "@/lib/runners/types";

/**
 * Each adapter is dynamically imported so pages/actions that only need one
 * provider (e.g. the Zerodha login-URL helper on the settings page) never
 * pull in the other three SDKs — metaapi.cloud-sdk in particular ships a
 * browser-only bundle its own package.json "exports" prefers, so keeping it
 * out of unrelated request paths avoids resolving it where it isn't needed.
 */
export async function getRunner(provider: BrokerProvider): Promise<BrokerRunner> {
  switch (provider) {
    case "metaapi":
      return (await import("@/lib/runners/metaapi")).metaapiRunner;
    case "zerodha":
      return (await import("@/lib/runners/zerodha")).zerodhaRunner;
    case "dhan":
      return (await import("@/lib/runners/dhan")).dhanRunner;
    case "motilal":
      return (await import("@/lib/runners/motilal")).motilalRunner;
  }
}

export * from "@/lib/runners/types";
export { saveAccountCredentials, markAccountStatus } from "@/lib/runners/credentials";
