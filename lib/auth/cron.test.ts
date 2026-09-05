import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { refuseUnauthorizedCron } from "@/lib/auth/cron";

const ORIGINAL = process.env.CRON_SECRET;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL;
});

function request(authorization?: string) {
  return new NextRequest("http://localhost/api/cron/sync-broker-accounts", {
    headers: authorization ? { authorization } : {},
  });
}

describe("refuseUnauthorizedCron", () => {
  it("allows a request carrying the exact bearer token", () => {
    process.env.CRON_SECRET = "s3cr3t-token";
    expect(refuseUnauthorizedCron(request("Bearer s3cr3t-token"))).toBeNull();
  });

  it("refuses a wrong secret of the same length", () => {
    process.env.CRON_SECRET = "s3cr3t-token";
    const response = refuseUnauthorizedCron(request("Bearer s3cr3t-tokeX"));
    expect(response?.status).toBe(401);
  });

  it("refuses a missing header", () => {
    process.env.CRON_SECRET = "s3cr3t-token";
    expect(refuseUnauthorizedCron(request())?.status).toBe(401);
  });

  it("refuses a correct prefix that is truncated", () => {
    process.env.CRON_SECRET = "s3cr3t-token";
    expect(refuseUnauthorizedCron(request("Bearer s3cr3t"))?.status).toBe(401);
  });

  it("refuses the raw secret without the Bearer scheme", () => {
    process.env.CRON_SECRET = "s3cr3t-token";
    expect(refuseUnauthorizedCron(request("s3cr3t-token"))?.status).toBe(401);
  });

  it("fails closed when CRON_SECRET is not configured", () => {
    delete process.env.CRON_SECRET;
    // An unset secret must never mean "open" — these routes place orders.
    expect(refuseUnauthorizedCron(request("Bearer anything"))?.status).toBe(401);
    expect(refuseUnauthorizedCron(request())?.status).toBe(401);
  });
});
