import { describe, it, expect } from "vitest";
import { parseSignalMessage, redactSecret, secretMatches } from "@/lib/webhooks/parse-signal-message";

describe("parseSignalMessage", () => {
  it("parses slug, action, symbol and key/value fields", () => {
    const parsed = parseSignalMessage("kushal,SELL,XAUUSD.r,tag=S1,quantity=0.01,type=PRICE");
    expect(parsed).toEqual({
      slug: "kushal",
      action: "SELL",
      symbol: "XAUUSD.r",
      fields: { tag: "S1", quantity: "0.01", type: "PRICE" },
      secret: null,
    });
  });

  it("strips a TradingView exchange prefix from the symbol", () => {
    const parsed = parseSignalMessage("kushal,BUY,OANDA:XAUUSD");
    expect(parsed).toMatchObject({ symbol: "XAUUSD" });
  });

  it("treats a missing symbol as 'use the strategy default'", () => {
    const parsed = parseSignalMessage("kushal,BUY,quantity=1");
    expect(parsed).toMatchObject({ symbol: null, fields: { quantity: "1" } });
  });

  it("lifts secret= out of the fields so it never reaches parsedFields", () => {
    const parsed = parseSignalMessage("kushal,BUY,XAUUSD,quantity=1,secret=abc123");
    expect(parsed).toMatchObject({ secret: "abc123", fields: { quantity: "1" } });
    expect("secret" in (parsed as { fields: Record<string, string> }).fields).toBe(false);
  });

  it("rejects an unknown action and an empty message", () => {
    expect(parseSignalMessage("kushal,HODL,XAUUSD")).toEqual({ error: 'unknown action "HODL"' });
    expect(parseSignalMessage("   ")).toEqual({ error: "empty message" });
  });
});

describe("redactSecret", () => {
  it("blanks the secret in a JSON body without touching the rest", () => {
    const raw = '{"message":"kushal,BUY,XAUUSD,quantity=1,secret=abc123"}';
    expect(redactSecret(raw)).toBe('{"message":"kushal,BUY,XAUUSD,quantity=1,secret=***"}');
  });

  it("blanks the secret in plain-text and form-encoded bodies", () => {
    expect(redactSecret("kushal,BUY,XAUUSD,secret=abc123")).toBe("kushal,BUY,XAUUSD,secret=***");
    expect(redactSecret("message=kushal,BUY,XAUUSD,secret=abc123&x=1")).toBe(
      "message=kushal,BUY,XAUUSD,secret=***&x=1",
    );
  });

  it("leaves a body with no secret unchanged", () => {
    const raw = '{"message":"kushal,BUY,XAUUSD,quantity=1"}';
    expect(redactSecret(raw)).toBe(raw);
  });
});

describe("secretMatches", () => {
  it("matches only the exact value", () => {
    expect(secretMatches("abc123", "abc123")).toBe(true);
    expect(secretMatches("abc123", "abc124")).toBe(false);
    expect(secretMatches("abc123", "abc12")).toBe(false);
    expect(secretMatches("abc123", null)).toBe(false);
    expect(secretMatches("abc123", "")).toBe(false);
  });
});
