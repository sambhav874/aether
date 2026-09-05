import "server-only";
import { fetchWithTimeout, BROKER_TIMEOUT_MS } from "@/lib/http";

const PROVISIONING_HOST =
  "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

export type MtServerGroup = {
  /** Broker company name, e.g. "AdamFxCapitals Ltd." */
  broker: string;
  /** Server names to put in the MT5 Server field, e.g. "AdamFxCapitals-Server". */
  servers: string[];
};

/**
 * Full-text fuzzy search over MetaAPI's registry of known MetaTrader servers.
 *
 * The SDK has no binding for this endpoint, so it is called directly. MetaAPI
 * caps the answer at 10 brokers x 10 servers, so this is a search box feeding a
 * combobox — never a list to enumerate up front. Servers MetaAPI does not know
 * still connect if the user types the name exactly, hence the free-text escape
 * hatch in the UI.
 *
 * Docs: GET /known-mt-servers/{version}/search?query=...
 */
export async function searchKnownMtServers(
  query: string,
  version: 4 | 5 = 5,
): Promise<MtServerGroup[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const token = process.env.METAAPI_TOKEN;
  if (!token) {
    throw new Error("METAAPI_TOKEN is not set — required for the MetaAPI runner.");
  }

  const url = new URL(`${PROVISIONING_HOST}/known-mt-servers/${version}/search`);
  url.searchParams.set("query", trimmed);

  const res = await fetchWithTimeout(url, {
    timeoutMs: BROKER_TIMEOUT_MS,
    headers: { "auth-token": token },
    // Broker registries move slowly; a short cache keeps keystroke-driven
    // lookups off MetaAPI's rate limit.
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`MetaAPI server search failed (${res.status})`);
  }

  const body = (await res.json()) as Record<string, string[]>;
  return Object.entries(body).map(([broker, servers]) => ({ broker, servers }));
}
