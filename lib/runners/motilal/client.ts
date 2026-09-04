import "server-only";
import { createHash } from "node:crypto";
import { getStoredCredentials, updateStoredCredentials } from "@/lib/runners/credentials";
import { generateTotp } from "@/lib/totp";

/**
 * Shared transport for every Motilal Oswal call. Endpoints, headers and
 * response envelopes here are verified against MOFSL's own Open API docs
 * (invest.motilaloswal.com/OpenApi/Dashboard/API_Documentation/ — see
 * HeaderParameters.html, LimitAPI.html, PortfolioAPI.html, OrdersAPI.html,
 * PriceLTPAPI.html), not community convention.
 */
export const BASE_URL = "https://openapi.motilaloswal.com";

export type MotilalCreds = {
  apiKey: string;
  authToken: string;
  clientCode: string;
  // Optional — MO's OpenAPI 2FA step normally wants a fresh 6-digit code
  // rather than a static secret, so this isn't consumed by placeOrder/etc.
  // today. Stored so the connect/reauth UI can render the live code for the
  // user to paste during MO's own login, instead of them needing a separate
  // authenticator app open.
  totpSecret?: string;
  // DOB (dd/mm/yyyy) or PAN — MO requires this as a second factor for
  // Investor accounts on top of the TOTP.
  twoFa?: string;
  /**
   * MOFSL trading password. Stored encrypted alongside the rest, and used
   * for one thing only: minting a fresh auth token. MO's token dies at 6 AM
   * every day by exchange mandate and MO publishes no refresh-token flow for
   * direct API keys, so without this every account goes stale each morning
   * and has to be re-pasted by hand before any balance can be read.
   */
  password?: string;
  /** Set by getCreds so a 401-equivalent can re-login and persist the new
   * token against the right account. Never sent to MO. */
  accountId?: string;
  /** ISO timestamp of the last successful login, for the 6 AM expiry check. */
  authTokenIssuedAt?: string;
};

/**
 * MO rejects any request missing these — they're mandatory on every call per
 * HeaderParameters.html (SEBI's audit-trail requirement), and a request
 * without them comes back HTTP 200 with status "ERROR", which is exactly how
 * balances silently read as 0.00 before this was fixed.
 *
 * The IP/MAC values identify the machine placing the order. In a serverless
 * deployment there's no meaningful LAN address, so they're env-configurable
 * and default to the static egress IP already used for MO's own order
 * whitelist (BROKER_RUNNER_STATIC_IP, see integrations-actions.ts).
 */
/**
 * MO issues two kinds of API key. A *self-built* key belongs to one retail
 * client, who pastes it in with their own credentials. A *vendor* key is
 * issued to a platform (email tradingapi@motilaloswal.com) and serves every
 * client who logs in through MO's portal — same shape as the Zerodha app key.
 * When MOTILAL_VENDOR_API_KEY is set, users never have to see a key at all.
 */
export function platformApiKey(): string | undefined {
  return process.env.MOTILAL_VENDOR_API_KEY?.trim() || undefined;
}

function resolveApiKey(creds: MotilalCreds): string {
  const key = creds.apiKey?.trim() || platformApiKey();
  if (!key) {
    throw new Error(
      "No Motilal API key — paste the key from your MO API portal, or set MOTILAL_VENDOR_API_KEY for a platform-wide vendor key.",
    );
  }
  return key;
}

/**
 * Per MO's FAQ Q35: vendors send their registered short name here, individual
 * clients send their own client code. Sending a client code under a vendor key
 * is what gets a vendor's calls attributed wrongly.
 */
function vendorInfo(creds: MotilalCreds): string {
  return process.env.MOTILAL_VENDOR_TAG?.trim() || creds.clientCode || "";
}

function auditHeaders(): Record<string, string> {
  const publicIp = process.env.BROKER_RUNNER_STATIC_IP ?? "127.0.0.1";
  return {
    "User-Agent": "MOSL/V.1.0.0",
    ClientLocalIp: process.env.BROKER_RUNNER_LOCAL_IP ?? publicIp,
    ClientPublicIp: publicIp,
    MacAddress: process.env.BROKER_RUNNER_MAC_ADDRESS ?? "00:00:00:00:00:00",
    SourceId: "Web",
  };
}

// MO8001/8002/8003 = bad or expired auth token; MO1011/MO2000 = the session
// behind it is gone. All of them mean "reconnect", which is what the sync job
// turns into needs_reauth — as opposed to a business rejection (bad symbol,
// insufficient margin) that a reconnect wouldn't fix.
// MO2007 ("Authorization is Invalid In Header Parameter") is what a stale or
// malformed token actually comes back as, and is the single most common
// failure — the token is only good until 6 AM.
export const AUTH_ERROR_CODES = new Set([
  "MO8001",
  "MO8002",
  "MO8003",
  "MO8050",
  "MO8051",
  "MO1011",
  "MO2000",
  "MO2007",
]);

export function isMotilalAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = error.message.match(/\[(MO\d+)\]/)?.[1];
  return code !== undefined && AUTH_ERROR_CODES.has(code);
}

type MotilalEnvelope = { status?: string; message?: string; errorcode?: string };

type LoginResponse = { AuthToken?: string; isAuthTokenVerified?: string };

/**
 * MO's direct-API login: POST /rest/login/v3/authdirectapi with
 * SHA256(password + APIKey) — AuthenticationProfileAPI.html. Returns a token
 * valid until the next 6 AM.
 */
export async function motilalLogin(creds: MotilalCreds): Promise<string> {
  if (!creds.password) {
    throw new Error(
      "Motilal Oswal: no stored password to mint an auth token with — reconnect the account with your MOFSL password, or paste a fresh auth token.",
    );
  }

  const apiKey = resolveApiKey(creds);
  const body: Record<string, string> = {
    userid: creds.clientCode,
    password: createHash("sha256").update(`${creds.password}${apiKey}`).digest("hex"),
  };
  if (creds.twoFa) body["2FA"] = creds.twoFa;
  if (creds.totpSecret) body.totp = generateTotp(creds.totpSecret);

  const res = await fetch(`${BASE_URL}/rest/login/v3/authdirectapi`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ApiKey: apiKey,
      vendorinfo: vendorInfo(creds),
      ...auditHeaders(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Motilal Oswal login failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as LoginResponse & MotilalEnvelope;
  if (json.status && json.status.toUpperCase() !== "SUCCESS") {
    const code = json.errorcode ? ` [${json.errorcode}]` : "";
    throw new Error(`Motilal Oswal login rejected${code}: ${json.message ?? json.status}`);
  }
  if (!json.AuthToken) {
    throw new Error("Motilal Oswal login returned no AuthToken");
  }
  // FALSE means MO wants the emailed/SMS OTP verified before the token works
  // — that needs a human, so fail loudly instead of storing a dead token.
  if (json.isAuthTokenVerified && json.isAuthTokenVerified.toUpperCase() === "FALSE") {
    throw new Error(
      "Motilal Oswal login needs OTP verification — add your TOTP secret and 2FA (DOB/PAN) to the connection, or verify the OTP on MO's portal and paste the auth token manually.",
    );
  }

  return json.AuthToken;
}

type ProfileResponse = { data?: { clientcode?: string; name?: string; usertype?: string } };

/**
 * Resolves who a token belongs to. The portal login flow (Login.aspx) hands
 * back only an authtoken — no client code — so the profile call is what turns
 * that token into an identifiable account.
 */
export async function motilalProfile(
  creds: MotilalCreds,
): Promise<{ clientCode: string; name: string }> {
  const res = await motilalFetch<ProfileResponse>(creds, "/rest/login/v1/getprofile", {
    method: "POST",
    body: JSON.stringify(creds.clientCode ? { clientcode: creds.clientCode } : {}),
  });

  const clientCode = res.data?.clientcode;
  if (!clientCode) throw new Error("Motilal Oswal profile returned no client code");
  return { clientCode, name: res.data?.name ?? clientCode };
}

/**
 * Browser login: send the user to MO's own portal with the API key, they type
 * their MOFSL id/password there, and MO redirects back to the app's registered
 * URL with `?authtoken=…_M` (LoginThruPortal.html). Nothing secret ever
 * reaches us — the same shape as the Zerodha flow.
 */
export function getMotilalLoginUrl(apiKey: string): string {
  return `https://invest.motilaloswal.com/OpenAPI/Login.aspx?apikey=${encodeURIComponent(apiKey)}`;
}

/** Logs in again and persists the new token so later requests (and other
 * server instances) skip the login round-trip. */
async function refreshAuthToken(creds: MotilalCreds): Promise<string> {
  const authToken = await motilalLogin(creds);
  creds.authToken = authToken;
  creds.authTokenIssuedAt = new Date().toISOString();

  if (creds.accountId) {
    const { accountId, ...persisted } = creds;
    await updateStoredCredentials(accountId, persisted as unknown as Record<string, string>);
  }

  return authToken;
}

export async function motilalFetch<T>(
  creds: MotilalCreds,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  try {
    return await request<T>(creds, path, init);
  } catch (error) {
    // The token expires at 6 AM daily. With a stored password we just log in
    // again and retry once, rather than parking the account in needs_reauth
    // until someone pastes a new token by hand.
    if (!isMotilalAuthError(error) || !creds.password) throw error;
    await refreshAuthToken(creds);
    return request<T>(creds, path, init);
  }
}

async function request<T>(creds: MotilalCreds, path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ApiKey: resolveApiKey(creds),
      Authorization: creds.authToken,
      vendorinfo: vendorInfo(creds),
      ...auditHeaders(),
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Motilal Oswal API ${path} failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as T & MotilalEnvelope;

  // Every MO endpoint answers HTTP 200 and reports failure only in the body's
  // `status`/`errorcode`. Treating that as success is what let a rejected
  // margin call fall through to `data === undefined` and post a 0.00 balance
  // over a real one, while the account still displayed "connected".
  if (json.status && json.status.toUpperCase() !== "SUCCESS") {
    const code = json.errorcode ? ` [${json.errorcode}]` : "";
    throw new Error(`Motilal Oswal API ${path} rejected${code}: ${json.message ?? json.status}`);
  }

  return json;
}

export async function getCreds(accountId: string): Promise<MotilalCreds> {
  const { credentials } = await getStoredCredentials(accountId);
  return { ...(credentials as unknown as MotilalCreds), accountId };
}
