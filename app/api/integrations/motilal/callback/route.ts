import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { connectBrokerAccount } from "@/lib/runners/connect-account";
import { MOTILAL_API_KEY_COOKIE } from "@/lib/runners/motilal/portal-login";
import { platformApiKey } from "@/lib/runners/motilal";

/**
 * Registered as the redirect URL on the MOFSL API portal — MO lands the user
 * here as `?authtoken=…_M` once they've logged in with their own MOFSL id and
 * password (LoginThruPortal.html). MO sends no client code with it, so the
 * adapter reads that back off the token via /getprofile.
 *
 * The API key comes from the short-lived cookie the "Log in with Motilal"
 * action set, since MO's redirect carries no state of its own.
 */
export async function GET(request: NextRequest) {
  const authToken = request.nextUrl.searchParams.get("authtoken");
  const settingsUrl = new URL("/dashboard/settings?tab=integration", request.url);
  const store = await cookies();
  // Absent under a vendor key — the adapter falls back to the platform one.
  const cookieKey = store.get(MOTILAL_API_KEY_COOKIE)?.value;
  const apiKey = cookieKey ?? platformApiKey();

  const fail = (message: string) => {
    settingsUrl.searchParams.set("motilal_error", message);
    return NextResponse.redirect(settingsUrl);
  };

  // One-shot: the key is consumed whichever way this goes.
  store.delete(MOTILAL_API_KEY_COOKIE);

  if (!authToken) return fail("Motilal login was cancelled or returned no token.");
  if (!apiKey) return fail("That login took too long — start again from Settings > Integrations.");

  // Only a per-user key is stored on the account; a vendor key stays in env.
  const result = await connectBrokerAccount("motilal", {
    apiKey: cookieKey ?? "",
    authToken,
    clientCode: "",
  });
  if (result.error) return fail(result.error);

  return NextResponse.redirect(settingsUrl);
}
