import { NextResponse, type NextRequest } from "next/server";
import { syncAllBrokerAccounts } from "@/lib/runners/sync";

// One broker round-trip per connected account, sequentially.
export const maxDuration = 60;

/**
 * Wire this to a scheduler (Supabase pg_cron via `net.http_post`, or a
 * Vercel Cron entry in vercel.json) hitting this URL every few minutes with
 * `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await syncAllBrokerAccounts();
  return NextResponse.json(summary);
}
