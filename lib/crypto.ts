import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const secret = process.env.BROKER_CREDENTIALS_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "BROKER_CREDENTIALS_ENCRYPTION_KEY is not set — required to store broker credentials.",
    );
  }
  return scryptSync(secret, "monarch-broker-credentials", 32);
}

export function encryptCredentials(payload: Record<string, string>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, data].map((b) => b.toString("base64")).join(":");
}

export function decryptCredentials(ciphertext: string): Record<string, string> {
  const [ivB64, tagB64, dataB64] = ciphertext.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

/**
 * Single-value variants for secrets that must stay readable by their owner.
 *
 * Webhook secrets can't be hashed: the owner has to paste the value into a
 * TradingView alert body, so it has to come back out. Encrypting still means
 * a database read on its own is not order-placement capability, which is what
 * plaintext storage made it.
 */
export function encryptSecret(plain: string): string {
  return encryptCredentials({ v: plain });
}

export function decryptSecret(ciphertext: string): string {
  return decryptCredentials(ciphertext).v;
}

/**
 * Ciphertext is three base64 parts joined by ":"; a webhook secret is 48 hex
 * characters and contains no colon. Lets reads handle both while existing
 * rows are migrated, so the rollout needs no downtime and re-running the
 * migration is harmless.
 */
export function isEncrypted(value: string): boolean {
  return value.split(":").length === 3;
}

/** Decrypts if encrypted, passes through if not — the read path during migration. */
export function readSecret(stored: string): string {
  return isEncrypted(stored) ? decryptSecret(stored) : stored;
}
