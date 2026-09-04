import "server-only";
import { createHmac } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Buffer {
  const clean = input.trim().toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = "";
  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) throw new Error("Invalid base32 character in TOTP secret.");
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** Throws if `secret` isn't decodable base32 — used to fail fast at connect time on a bad paste. */
export function assertValidTotpSecret(secret: string): void {
  const key = base32Decode(secret);
  if (key.length === 0) throw new Error("TOTP secret is empty or not valid base32.");
}

/**
 * RFC 6238 TOTP, 30s step / 6 digits / HMAC-SHA1 — the parameters every
 * authenticator app (and every broker's "Setup TOTP" QR flow) assumes
 * unless it says otherwise.
 */
export function generateTotp(secret: string, at: number = Date.now()): string {
  const key = base32Decode(secret);
  const counter = Math.floor(at / 1000 / 30);

  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(code % 1_000_000).padStart(6, "0");
}

/** Seconds remaining in the current 30s TOTP window — for a countdown next to the code. */
export function totpSecondsRemaining(at: number = Date.now()): number {
  return 30 - (Math.floor(at / 1000) % 30);
}
