import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

// Always reflect the state of this instance right now, never a cached answer.
export const dynamic = "force-dynamic";

/**
 * Liveness + dependency check for external monitoring.
 *
 * Deliberately unauthenticated and deliberately thin: it reports whether this
 * instance can reach its database, and nothing that would be useful to an
 * unauthenticated caller (no counts, no workspace data, no version strings).
 * Returns 503 when a dependency is down so an uptime monitor can alert on the
 * status code alone.
 */
export async function GET() {
  const startedAt = Date.now();

  let database: "ok" | "unreachable" = "ok";
  try {
    await db.execute(sql`select 1`);
  } catch (error) {
    console.error("[health] database unreachable —", error);
    database = "unreachable";
  }

  const healthy = database === "ok";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      checks: { database },
      latencyMs: Date.now() - startedAt,
      at: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
