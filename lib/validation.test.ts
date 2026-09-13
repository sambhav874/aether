import { describe, expect, it } from "vitest";
import { emailSchema, fetchableUrlSchema, isPrivateHost, labelSchema, noteBodySchema } from "@/lib/validation";

const accepts = (v: unknown) => fetchableUrlSchema.safeParse(v).success;

describe("fetchableUrlSchema", () => {
  it("accepts ordinary public feeds", () => {
    expect(accepts("https://feeds.reuters.com/reuters/businessNews")).toBe(true);
    expect(accepts("http://example.com/rss.xml")).toBe(true);
  });

  it("blocks cloud instance metadata", () => {
    // The address that matters most: on every major cloud this endpoint hands
    // out instance credentials to whoever can make the server request it.
    expect(accepts("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(accepts("http://metadata.google.internal/computeMetadata/v1/")).toBe(false);
  });

  it("blocks loopback", () => {
    for (const url of ["http://localhost:3000/x", "http://127.0.0.1/x", "http://[::1]/x", "http://0.0.0.0/x"]) {
      expect(accepts(url)).toBe(false);
    }
  });

  it("blocks RFC1918 private ranges", () => {
    for (const url of ["http://10.0.0.5/x", "http://192.168.1.1/x", "http://172.16.0.1/x", "http://172.31.255.1/x"]) {
      expect(accepts(url)).toBe(false);
    }
  });

  it("does not over-block public addresses that look similar", () => {
    // 172.32 is outside the private range; blocking it would be wrong.
    expect(accepts("http://172.32.0.1/x")).toBe(true);
    expect(accepts("http://11.0.0.1/x")).toBe(true);
  });

  it("blocks internal-looking suffixes", () => {
    expect(accepts("http://db.internal/feed")).toBe(false);
    expect(accepts("http://printer.local/feed")).toBe(false);
  });

  it("rejects non-http schemes", () => {
    for (const url of ["file:///etc/passwd", "gopher://x/", "ftp://x/", "javascript:alert(1)"]) {
      expect(accepts(url)).toBe(false);
    }
  });

  it("rejects anything that is not a URL", () => {
    expect(accepts("not a url")).toBe(false);
    expect(accepts("")).toBe(false);
  });
});

describe("isPrivateHost", () => {
  it("treats IPv6 unique-local and link-local as private", () => {
    expect(isPrivateHost("fd00::1")).toBe(true);
    expect(isPrivateHost("fe80::1")).toBe(true);
  });

  it("allows a public IPv6 address", () => {
    expect(isPrivateHost("2606:4700:4700::1111")).toBe(false);
  });
});

describe("field schemas", () => {
  it("bounds a note body and requires content", () => {
    expect(noteBodySchema.safeParse("  ").success).toBe(false);
    expect(noteBodySchema.safeParse("x".repeat(6000)).success).toBe(false);
    expect(noteBodySchema.safeParse("sized out early").success).toBe(true);
  });

  it("trims labels and bounds their length", () => {
    expect(labelSchema.parse("  Reuters  ")).toBe("Reuters");
    expect(labelSchema.safeParse("x".repeat(200)).success).toBe(false);
  });

  it("validates emails", () => {
    expect(emailSchema.safeParse("trader@example.com").success).toBe(true);
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });
});
