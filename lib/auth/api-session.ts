import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";

export type ApiSession = { workspaceId: string; userId: string };

/**
 * Session resolution for route handlers, returning null instead of redirecting.
 *
 * requireActiveWorkspace() calls redirect(), which throws NEXT_REDIRECT — in a
 * route handler that becomes a 307 to /login, so a programmatic client asking
 * for JSON receives an HTML login page and no status code it can branch on.
 * Pages want the redirect; APIs want a 401.
 */
export async function getApiSession(): Promise<ApiSession | null> {
  const headerList = await headers();
  const session = await auth.api.getSession({ headers: headerList });
  if (!session) return null;

  const organizations = await auth.api.listOrganizations({ headers: headerList });
  if (organizations.length === 0) return null;

  const activeId = session.session.activeOrganizationId;
  const active = organizations.find((org) => org.id === activeId) ?? organizations[0];

  return { workspaceId: active.id, userId: session.user.id };
}
