/**
 * Webhook secrets are mandatory: a strategy's slug is derived from its name
 * and is unique across the whole product, so slug-only auth means anyone who
 * guesses "eurusd-ema-1" can place live orders on someone else's account.
 * Every strategy gets a secret at creation and can only ever rotate it.
 */

/**
 * Hex, not base64 — the secret rides inside a comma-separated webhook message
 * and gets pasted into a Pine string, so anything containing "+", "/" or "="
 * is a footgun. 24 bytes = 48 hex characters.
 */
export function generateWebhookSecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
