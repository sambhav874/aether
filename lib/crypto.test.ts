import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, isEncrypted, readSecret } from "@/lib/crypto";

beforeAll(() => {
  process.env.BROKER_CREDENTIALS_ENCRYPTION_KEY ??= "test-key-not-a-real-secret";
});

describe("secret encryption", () => {
  it("round-trips a webhook secret", () => {
    const secret = "a".repeat(48);
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("produces different ciphertext each time", () => {
    // Random IV per call — identical secrets must not produce identical rows,
    // or the database leaks which strategies share a secret.
    const secret = "b".repeat(48);
    expect(encryptSecret(secret)).not.toBe(encryptSecret(secret));
  });

  it("does not contain the plaintext", () => {
    const secret = "deadbeef".repeat(6);
    expect(encryptSecret(secret)).not.toContain(secret);
  });

  it("rejects tampered ciphertext rather than returning garbage", () => {
    // AES-GCM is authenticated; a modified row must fail loudly.
    const cipher = encryptSecret("c".repeat(48));
    const [iv, tag, data] = cipher.split(":");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 0xff;
    expect(() => decryptSecret([iv, tag, flipped.toString("base64")].join(":"))).toThrow();
  });
});

describe("isEncrypted", () => {
  it("recognizes ciphertext by its three-part shape", () => {
    expect(isEncrypted(encryptSecret("x".repeat(48)))).toBe(true);
  });

  it("treats a raw hex secret as plaintext", () => {
    expect(isEncrypted("a1b2c3".repeat(8))).toBe(false);
  });
});

describe("readSecret", () => {
  it("decrypts an encrypted value", () => {
    const secret = "f".repeat(48);
    expect(readSecret(encryptSecret(secret))).toBe(secret);
  });

  it("passes a not-yet-migrated plaintext value straight through", () => {
    // Lets the rollout happen without downtime — reads handle both while the
    // backfill script works through existing rows.
    const legacy = "0123456789abcdef".repeat(3);
    expect(readSecret(legacy)).toBe(legacy);
  });
});
