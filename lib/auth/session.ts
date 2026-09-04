import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function requireActiveWorkspace() {
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
}
