import { NextResponse, type NextRequest } from "next/server";
import { refuseUnauthorizedCron } from "@/lib/auth/cron";
import { pruneRetention } from "@/lib/retention/prune";

// Deletes in bulk on a table that grows with every signal ever received.
export const maxDuration = 300;

/**
 * Applies the retention windows in lib/retention/prune.ts. Nothing expired
 * before this existed: raw webhook bodies were kept verbatim and forever,
 * which is both unbounded growth and the data a user is most likely to ask
 * to have removed.
 */
export async function GET(request: NextRequest) {
  const unauthorized = refuseUnauthorizedCron(request);
  if (unauthorized) return unauthorized;

  const summary = await pruneRetention();
  return NextResponse.json(summary);
}
