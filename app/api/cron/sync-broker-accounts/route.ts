import { NextResponse, type NextRequest } from "next/server";
import { refuseUnauthorizedCron } from "@/lib/auth/cron";
import { syncAllBrokerAccounts } from "@/lib/runners/sync";

// One broker round-trip per connected account, sequentially — so the budget
// has to scale with connected accounts, not with a fixed idea of "a sync".
export const maxDuration = 300;

/**
 * Wire this to a scheduler (Supabase pg_cron via `net.http_post`, or a
 * Vercel Cron entry in vercel.json) hitting this URL every few minutes with
 * `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  const unauthorized = refuseUnauthorizedCron(request);
  if (unauthorized) return unauthorized;

  const summary = await syncAllBrokerAccounts();
  return NextResponse.json(summary);
}
