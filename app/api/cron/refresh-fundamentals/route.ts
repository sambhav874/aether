import { NextResponse, type NextRequest } from "next/server";
import { refuseUnauthorizedCron } from "@/lib/auth/cron";
import { refreshInstrumentFundamentals } from "@/lib/ai/screening/refresh-fundamentals";

/**
 * Nightly refresh of instrument_fundamentals, which powers the
 * screen_stocks tool (PLAN_AI_COPILOT.md §2.1). Wire this to a scheduler
 * (Supabase pg_cron via `net.http_post`, or a Vercel Cron entry in
 * vercel.json) hitting this URL once daily after market close with
 * `Authorization: Bearer $CRON_SECRET` — same pattern as
 * sync-broker-accounts and poll-limit-orders. ~130 symbols at 5-per-batch
 * with a 500ms stagger is a couple of minutes, well inside a cron job's
 * usual timeout budget.
 */
// ~130 symbols staggered wants ~2 minutes, but 300 is above the free-tier
// function ceiling and a deployment that asks for more than its plan allows
// is rejected outright. 60 truncates the refresh part-way (harmless — it's
// an idempotent upsert that resumes next run); raise back to 300 on a paid
// plan.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const unauthorized = refuseUnauthorizedCron(request);
  if (unauthorized) return unauthorized;

  const summary = await refreshInstrumentFundamentals();
  return NextResponse.json(summary);
}
