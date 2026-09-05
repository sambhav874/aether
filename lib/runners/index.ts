import "server-only";
import type { BrokerProvider, BrokerRunner } from "@/lib/runners/types";
import { instrumentRunner } from "@/lib/runners/instrument";

/**
 * Each adapter is dynamically imported so pages/actions that only need one
 * provider (e.g. the Zerodha login-URL helper on the settings page) never
 * pull in the other three SDKs — metaapi.cloud-sdk in particular ships a
 * browser-only bundle its own package.json "exports" prefers, so keeping it
 * out of unrelated request paths avoids resolving it where it isn't needed.
 */
export async function getRunner(provider: BrokerProvider): Promise<BrokerRunner> {
  // Every caller — dispatch, the sync job, the limit-order poller, the manual
  // order panel — comes through here, so wrapping once instruments the whole
  // order path without any of them knowing about it.
  return instrumentRunner(await loadRunner(provider));
}

async function loadRunner(provider: BrokerProvider): Promise<BrokerRunner> {
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
