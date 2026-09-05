import { NextResponse, type NextRequest } from "next/server";
import { refuseUnauthorizedCron } from "@/lib/auth/cron";
import { evaluatePartialRules } from "@/lib/strategies/rules";

// Walks every open position and may place broker orders — more than the default.
export const maxDuration = 60;

/**
 * Fires strategy partial-booking rules against open, non-paper positions.
 * Wire this to a scheduler (Supabase pg_cron via `net.http_post`, or a
 * Vercel Cron entry in vercel.json) hitting this URL every few minutes with
 * `Authorization: Bearer $CRON_SECRET` — same pattern as
 * sync-broker-accounts and poll-limit-orders.
 *
 * Trailing-stop rule execution is not built yet — see the comment on
 * lib/strategies/rules.ts's evaluatePartialRules for why.
 */
export async function GET(request: NextRequest) {
  const unauthorized = refuseUnauthorizedCron(request);
  if (unauthorized) return unauthorized;

  const summary = await evaluatePartialRules();
  return NextResponse.json(summary);
}
