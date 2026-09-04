import { headers } from "next/headers";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { cn } from "@/lib/utils";
import { AppearanceForm } from "./appearance-form";
import { IntegrationsPanel } from "./integrations-panel";
import { getZerodhaConnectUrl } from "./integrations-actions";
import { ProfileForm } from "./profile-form";
import { SecurityForm } from "./security-form";
import { NotificationsForm } from "./notifications-form";
import { RssFeedsPanel } from "./rss-feeds-panel";
import { AiForm } from "./ai-form";
import { getModelPrefs } from "@/lib/ai/settings/actions";
import { GeneralForm } from "./general-form";
import { MembersPanel } from "./members-panel";
import { AuditLogPanel } from "./audit-log-panel";
import { BillingFallbackPanel } from "./billing-fallback-panel";
import { requireActiveWorkspace } from "@/lib/auth/session";
import { auth } from "@/lib/auth/server";
import { getNotificationPreferences } from "@/lib/settings/actions";
import { getUserRssFeeds } from "@/lib/rss-feeds/actions";
import { hasWorkspacePermission } from "@/lib/auth/permissions";
import { db } from "@/db/client";
import { brokerAccounts, telegramConnections } from "@/db/schema";

const ACCOUNT_TABS = [
  { value: "profile", label: "Profile" },
  { value: "theme", label: "Appearance" },
  { value: "security", label: "Password & 2FA" },
  { value: "notifications", label: "Notifications" },
  { value: "rss-feeds", label: "RSS Feeds" },
  { value: "ai", label: "AI" },
];

const WORKSPACE_TABS = [
  { value: "organization", label: "General" },
  { value: "members", label: "Members" },
  { value: "billing", label: "Billing & plan" },
  { value: "usage", label: "Usage & credits" },
  { value: "integration", label: "Integrations" },
  { value: "audit-log", label: "Audit log" },
  { value: "danger", label: "Danger zone" },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "theme" } = await searchParams;

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <nav className="w-full shrink-0 space-y-6 md:w-56">
        <div>
          <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Account
          </p>
          <ul className="space-y-0.5">
            {ACCOUNT_TABS.map((t) => (
              <SettingsNavItem key={t.value} tab={t} active={tab === t.value} />
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Workspace
          </p>
          <ul className="space-y-0.5">
            {WORKSPACE_TABS.map((t) => (
              <SettingsNavItem key={t.value} tab={t} active={tab === t.value} />
            ))}
          </ul>
        </div>
      </nav>

      <div className="min-w-0 flex-1">
        {tab === "theme" ? (
          <AppearanceForm />
        ) : tab === "profile" ? (
          <ProfileForm />
        ) : tab === "security" ? (
          <SecurityForm />
        ) : tab === "notifications" ? (
          <NotificationsTab />
        ) : tab === "rss-feeds" ? (
          <RssFeedsTab />
        ) : tab === "ai" ? (
          <AiTab />
        ) : tab === "organization" ? (
          <GeneralTab />
        ) : tab === "members" ? (
          <MembersTab />
        ) : tab === "audit-log" ? (
          <AuditLogPanel />
        ) : tab === "billing" || tab === "usage" ? (
          <BillingFallbackPanel />
        ) : tab === "integration" ? (
          <IntegrationsTab />
        ) : (
          <p className="text-sm text-muted-foreground">
            This section ships in a later phase — see the build plan for scheduling.
          </p>
        )}
      </div>
    </div>
  );
}

async function NotificationsTab() {
  const prefs = await getNotificationPreferences();

  return (
    <div className="space-y-8">
      <NotificationsForm initial={prefs} />
      <p className="text-xs text-muted-foreground">
        Manage Telegram chats under{" "}
        <Link href="/dashboard/settings?tab=integration" className="underline underline-offset-2">
          Integrations &gt; Notifications
        </Link>
        .
      </p>
    </div>
  );
}

async function RssFeedsTab() {
  const feeds = await getUserRssFeeds();
  return <RssFeedsPanel feeds={feeds} />;
}

async function AiTab() {
  const { rows, catalog, availableProviders } = await getModelPrefs();
  return <AiForm initialRows={rows} catalog={catalog} availableProviders={availableProviders} />;
}

async function GeneralTab() {
  const { workspace } = await requireActiveWorkspace();
  return <GeneralForm workspace={{ name: workspace.name, slug: workspace.slug }} />;
}

async function MembersTab() {
  const { workspace, session } = await requireActiveWorkspace();
  const headerList = await headers();

  const [{ members }, invitations] = await Promise.all([
    auth.api.listMembers({ headers: headerList, query: { organizationId: workspace.id } }),
    auth.api.listInvitations({ headers: headerList, query: { organizationId: workspace.id } }),
  ]);

  return (
    <MembersPanel
      members={members.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
      }))}
      invitations={invitations
        .filter((i) => i.status === "pending")
        .map((i) => ({ id: i.id, email: i.email, role: i.role ?? "trader", status: i.status, expiresAt: i.expiresAt }))}
      currentUserId={session.user.id}
    />
  );
}

async function IntegrationsTab() {
  const { workspace, role } = await requireActiveWorkspace();
  const canManage = hasWorkspacePermission(role, { broker: ["manage"] });
  const canConnect = hasWorkspacePermission(role, { broker: ["connect"] });

  const [accounts, telegramRows] = await Promise.all([
    db
      .select({
        id: brokerAccounts.id,
        label: brokerAccounts.label,
        provider: brokerAccounts.provider,
        status: brokerAccounts.status,
        staticIp: brokerAccounts.staticIp,
        balance: brokerAccounts.balance,
        equity: brokerAccounts.equity,
        currency: brokerAccounts.currency,
        metadata: brokerAccounts.metadata,
        lastSyncAt: brokerAccounts.lastSyncAt,
        enabled: brokerAccounts.enabled,
        positionSyncEnabled: brokerAccounts.positionSyncEnabled,
      })
      .from(brokerAccounts)
      .where(eq(brokerAccounts.workspaceId, workspace.id)),
    db
      .select({
        id: telegramConnections.id,
        chatId: telegramConnections.chatId,
        label: telegramConnections.label,
        active: telegramConnections.active,
      })
      .from(telegramConnections)
      .where(eq(telegramConnections.workspaceId, workspace.id)),
  ]);

  let zerodhaLoginUrl = "";
  try {
    zerodhaLoginUrl = await getZerodhaConnectUrl();
  } catch {
    // ZERODHA_API_KEY not configured yet — the panel shows a disabled state.
  }

  return (
    <IntegrationsPanel
      accounts={accounts}
      zerodhaLoginUrl={zerodhaLoginUrl}
      motilalVendorKey={Boolean(process.env.MOTILAL_VENDOR_API_KEY?.trim())}
      canManage={canManage}
      canConnect={canConnect}
      telegramConnections={telegramRows}
    />
  );
}

function SettingsNavItem({
  tab,
  active,
}: {
  tab: { value: string; label: string };
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={`/dashboard/settings?tab=${tab.value}`}
        className={cn(
          "block rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground",
          active && "bg-accent text-accent-foreground font-medium",
        )}
      >
        {tab.label}
      </Link>
    </li>
  );
}
