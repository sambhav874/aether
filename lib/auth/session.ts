import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

/**
 * `cache()`-wrapped so the layout and the page it renders share one lookup
 * instead of each paying their own round trip — the database is a long way
 * from the functions, so duplicate auth calls are the single easiest thing
 * to stop paying for. Deduped per request only; nothing is cached across
 * requests.
 */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export const requireSession = cache(async () => {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
});

export const requireActiveWorkspace = cache(async () => {
  const session = await requireSession();
  const headerList = await headers();
  const organizations = await auth.api.listOrganizations({
    headers: headerList,
  });

  if (organizations.length === 0) {
    redirect("/onboarding/workspace");
  }

  const activeOrgId = session.session.activeOrganizationId;
  const active =
    organizations.find((org) => org.id === activeOrgId) ?? organizations[0];

  const fullOrg = await auth.api.getFullOrganization({
    headers: headerList,
    query: { organizationId: active.id },
  });

  const membership = fullOrg?.members.find(
    (m) => m.userId === session.user.id,
  );

  return {
    session,
    workspace: active,
    workspaces: organizations,
    role: membership?.role ?? "viewer",
  };
});
