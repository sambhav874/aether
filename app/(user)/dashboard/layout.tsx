import { eq } from "drizzle-orm";
import { requireActiveWorkspace } from "@/lib/auth/session";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { db } from "@/db/client";
import { brokerAccounts } from "@/db/schema";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, workspace, workspaces } = await requireActiveWorkspace();

  const accounts = await db
    .select({
      id: brokerAccounts.id,
      label: brokerAccounts.label,
      provider: brokerAccounts.provider,
      status: brokerAccounts.status,
    })
    .from(brokerAccounts)
    .where(eq(brokerAccounts.workspaceId, workspace.id));

  const issueCount = accounts.filter((a) => a.status !== "connected").length;
  const healthPct =
    accounts.length === 0 ? 100 : Math.round(((accounts.length - issueCount) / accounts.length) * 100);

  return (
    <SidebarProvider>
      <AppSidebar
        organizations={workspaces}
        activeOrganizationId={workspace.id}
        connectionAccounts={accounts.map((a) => ({
          id: a.id,
          label: a.label,
          provider: a.provider,
          connected: a.status === "connected",
        }))}
        issueCount={issueCount}
        healthPct={healthPct}
      />
      <SidebarInset>
        <Topbar
          userName={session.user.name}
          userEmail={session.user.email}
        />
        <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
