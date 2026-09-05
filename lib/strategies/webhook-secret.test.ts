import { describe, expect, it } from "vitest";
import { generateWebhookSecret } from "@/lib/strategies/webhook-secret";

describe("generateWebhookSecret", () => {
  it("is 48 lowercase hex characters", () => {
    expect(generateWebhookSecret()).toMatch(/^[0-9a-f]{48}$/);
  });

  it("contains nothing that breaks a comma-separated Pine string", () => {
    // The secret is pasted into a TradingView alert body, so "+", "/", "="
    // and "," would all be footguns — this is why it is hex, not base64.
    const secret = generateWebhookSecret();
    for (const char of ["+", "/", "=", ",", " "]) {
      expect(secret).not.toContain(char);
    }
  });

  it("does not repeat", () => {
    const secrets = new Set(Array.from({ length: 200 }, generateWebhookSecret));
    expect(secrets.size).toBe(200);
  });
});
