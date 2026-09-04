import { NextResponse, type NextRequest } from "next/server";
import { requireActiveWorkspace } from "@/lib/auth/session";
import { zerodhaRunner } from "@/lib/runners/zerodha";
import { saveAccountCredentials } from "@/lib/runners/credentials";

/**
 * Registered as the redirect URL on the Kite Connect app (developers.kite.trade)
 * — Zerodha lands the user here with `request_token` after they log in and
 * authorize the app. This same flow re-runs whenever an account's status
 * flips to "needs_reauth" (the daily access-token expiry).
 */
export async function GET(request: NextRequest) {
  const requestToken = request.nextUrl.searchParams.get("request_token");
  const status = request.nextUrl.searchParams.get("status");
  const settingsUrl = new URL("/dashboard/settings?tab=integration", request.url);

  if (status !== "success" || !requestToken) {
    settingsUrl.searchParams.set("zerodha_error", "Login was cancelled or failed.");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const { workspace } = await requireActiveWorkspace();
    const result = await zerodhaRunner.connectAccount({ requestToken });

    await saveAccountCredentials({
      workspaceId: workspace.id,
      provider: "zerodha",
      externalAccountId: result.account.externalAccountId,
      label: result.account.label,
      status: result.account.status,
      credentials: result.credentials,
    });
  } catch (error) {
    settingsUrl.searchParams.set(
      "zerodha_error",
      error instanceof Error ? error.message : "Could not connect Zerodha account.",
    );
    return NextResponse.redirect(settingsUrl);
  }

  return NextResponse.redirect(settingsUrl);
}
