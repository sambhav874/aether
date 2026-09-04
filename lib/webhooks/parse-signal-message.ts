export type SignalAction =
  | "BUY"
  | "SELL"
  | "CLOSELONG"
  | "CLOSESHORT"
  | "MODIFY"
  | "CLOSELONGPARTIAL"
  | "CLOSESHORTPARTIAL"
  | "CLOSESHORTBUY"
  | "CLOSELONGSELL"
  | "CLOSESHORTSELL"
  | "CLOSELONGBUY";

const VALID_ACTIONS = new Set<string>([
  "BUY",
  "SELL",
  "CLOSELONG",
  "CLOSESHORT",
  "MODIFY",
  "CLOSELONGPARTIAL",
  "CLOSESHORTPARTIAL",
  "CLOSESHORTBUY",
  "CLOSELONGSELL",
  "CLOSESHORTSELL",
  "CLOSELONGBUY",
]);

export type ParsedMessage = {
  slug: string;
  action: SignalAction;
  /** null means "use the strategy's configured default symbol" */
  symbol: string | null;
  /** lowercased key=value pairs, e.g. { tag: "setup1", risk: "2" } */
  fields: Record<string, string>;
  /**
   * The `secret=` value, lifted out of `fields` so it never reaches the
   * signals row's parsedFields column. null when the caller sent none —
   * which is valid for any strategy that hasn't set a webhook secret.
   */
  secret: string | null;
};

export type ParseError = { error: string };

/**
 * Parses the "SLUG,ACTION,SYMBOL[,key=value,...]" message format. SYMBOL is
 * positional but optional — if the token right after ACTION contains "=" it's
 * treated as the start of the key=value list and symbol falls back to the
 * strategy default (resolved by the caller, which knows the strategy).
 *
 * Values are split on a bare "," so a value containing a comma (e.g. a
 * `comment=` with punctuation) will be truncated — acceptable for now since
 * `comment` is metadata-only and not yet wired to any action logic.
 */
export function parseSignalMessage(message: string): ParsedMessage | ParseError {
  const trimmed = message.trim();
  if (!trimmed) return { error: "empty message" };

  const tokens = trimmed.split(",").map((t) => t.trim());
  const slug = tokens[0];
  if (!slug) return { error: "missing strategy slug" };
  if (tokens.length < 2 || !tokens[1]) return { error: "missing action" };

  const rawAction = tokens[1].toUpperCase();
  if (!VALID_ACTIONS.has(rawAction)) {
    return { error: `unknown action "${rawAction}"` };
  }

  let symbol: string | null = null;
  let fieldTokens = tokens.slice(2);
  if (fieldTokens.length > 0 && fieldTokens[0].length > 0 && !fieldTokens[0].includes("=")) {
    // TradingView's {{ticker}} placeholder can carry an exchange prefix
    // (e.g. "OANDA:XAUUSD", "NSE:NIFTY") that no broker adapter here
    // recognizes — strip it so the symbol matches what the broker expects.
    symbol = fieldTokens[0].includes(":") ? fieldTokens[0].split(":").pop()! : fieldTokens[0];
    fieldTokens = fieldTokens.slice(1);
  }

  const fields: Record<string, string> = {};
  let secret: string | null = null;
  for (const token of fieldTokens) {
    const eq = token.indexOf("=");
    if (eq === -1) continue;
    const key = token.slice(0, eq).trim().toLowerCase();
    const value = token.slice(eq + 1).trim();
    if (!key) continue;
    if (key === "secret") {
      secret = value;
      continue;
    }
    fields[key] = value;
  }

  return { slug, action: rawAction as SignalAction, symbol, fields, secret };
}

/**
 * Blanks the `secret=` value anywhere in a raw request body before it's
 * stored on the signals row. The webhook secret is a long-lived credential
 * pasted into a TradingView alert — the signal log shouldn't be a place to
 * read it back out. Runs over the raw text (not the parsed message) so it
 * covers the JSON, form-urlencoded and plain-text body shapes alike.
 */
export function redactSecret(raw: string): string {
  return raw.replace(/(\bsecret\s*=\s*)([^,"'\s}&]*)/gi, "$1***");
}

/** Constant-time-ish comparison for the webhook secret. */
export function secretMatches(expected: string, provided: string | null): boolean {
  if (!provided) return false;
  if (expected.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}
