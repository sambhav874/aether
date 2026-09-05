import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Bearer check for the /api/cron/* routes, in constant time.
 *
 * These endpoints authorize broker syncs, resting-order polling and rule
 * execution, so the previous `authHeader !== \`Bearer ${secret}\`` gave an
 * unauthenticated caller a timing oracle on a token that can move money.
 * `timingSafeEqual` needs equal-length buffers, so length is compared first
 * — that leaks the length of the header and nothing else.
 *
 * Returns a 401 response when the request must be refused, or null to proceed.
 */
export function refuseUnauthorizedCron(request: NextRequest): NextResponse | null {
  const unauthorized = NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const secret = process.env.CRON_SECRET;
  if (!secret) return unauthorized;

  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (provided.length !== expected.length) return unauthorized;
  if (!timingSafeEqual(provided, expected)) return unauthorized;

  return null;
}
