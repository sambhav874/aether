"use server";

import { revalidatePath } from "next/cache";
import { requireActiveWorkspace } from "@/lib/auth/session";
import { hasWorkspacePermission } from "@/lib/auth/permissions";
import { getRunner } from "@/lib/runners";
import { syncPositions } from "@/lib/runners/sync";
import { getStoredCredentials, markAccountStatus } from "@/lib/runners/credentials";
import { getZerodhaLoginUrl } from "@/lib/runners/zerodha";
import { getMotilalLoginUrl, platformApiKey } from "@/lib/runners/motilal";
import { searchKnownMtServers, type MtServerGroup } from "@/lib/runners/metaapi/servers";
import { connectBrokerAccount, type ConnectActionState } from "@/lib/runners/connect-account";
import { cookies } from "next/headers";
import {
  MOTILAL_API_KEY_COOKIE,
  MOTILAL_API_KEY_COOKIE_MAX_AGE,
} from "@/lib/runners/motilal/portal-login";
import { db } from "@/db/client";
import { brokerAccounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit/log";
import { generateTotp, totpSecondsRemaining } from "@/lib/totp";

export type { ConnectActionState };

const connect = connectBrokerAccount;

export async function connectMetaApiAccount(
  _prev: ConnectActionState,
  formData: FormData,
): Promise<ConnectActionState> {
  return connect("metaapi", {
    login: String(formData.get("login") ?? ""),
    password: String(formData.get("password") ?? ""),
    server: String(formData.get("server") ?? ""),
    name: String(formData.get("name") ?? ""),
  });
}

/**
 * Backs the MT5 Server combobox. MetaAPI's registry is far too large to ship to
 * the client, so each keystroke searches it server-side — the METAAPI_TOKEN
 * never leaves the server.
 */
export async function searchMetaApiServers(query: string): Promise<MtServerGroup[]> {
  const { role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { broker: ["manage"] })) return [];

  try {
    return await searchKnownMtServers(query);
  } catch {
    // A registry lookup failing must not block the form — the field still
    // accepts a hand-typed server name.
    return [];
  }
}

export async function connectDhanAccount(
  _prev: ConnectActionState,
  formData: FormData,
): Promise<ConnectActionState> {
  return connect("dhan", {
    accessToken: String(formData.get("accessToken") ?? ""),
    dhanClientId: String(formData.get("dhanClientId") ?? ""),
    pin: String(formData.get("pin") ?? ""),
    totpSecret: String(formData.get("totpSecret") ?? ""),
    label: String(formData.get("label") ?? ""),
  });
}

export async function connectMotilalAccount(
  _prev: ConnectActionState,
  formData: FormData,
): Promise<ConnectActionState> {
  return connect("motilal", {
    apiKey: String(formData.get("apiKey") ?? ""),
    authToken: String(formData.get("authToken") ?? ""),
    password: String(formData.get("password") ?? ""),
    clientCode: String(formData.get("clientCode") ?? ""),
    totpSecret: String(formData.get("totpSecret") ?? ""),
    twoFa: String(formData.get("twoFa") ?? ""),
    label: String(formData.get("label") ?? ""),
  });
}

/**
 * Starts Motilal's browser login (LoginThruPortal.html): the user types their
 * MOFSL id/password on MO's own page and MO redirects back to
 * /api/integrations/motilal/callback with the auth token. Nothing but the API
 * key is needed up front — and unlike the password flow, no MOFSL password is
 * ever stored here. The token still dies at 6 AM, so this has to be re-run
 * daily unless a password is saved.
 */
export async function startMotilalPortalLogin(
  apiKey: string,
): Promise<{ url?: string; error?: string }> {
  const { role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { broker: ["connect"] })) {
    return { error: "You don't have permission to connect broker accounts." };
  }

  // A vendor key belongs to the deployment, so the user supplies nothing;
  // a self-built key is per-user and rides along in the callback cookie.
  const key = apiKey.trim() || platformApiKey();
  if (!key) return { error: "Enter your Motilal API key first." };

  if (apiKey.trim()) {
    const store = await cookies();
    store.set(MOTILAL_API_KEY_COOKIE, key, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MOTILAL_API_KEY_COOKIE_MAX_AGE,
    });
  }

  return { url: getMotilalLoginUrl(key) };
}

export async function getZerodhaConnectUrl(): Promise<string> {
  const { role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { broker: ["connect"] })) {
    throw new Error("You don't have permission to connect broker accounts.");
  }
  return getZerodhaLoginUrl();
}

export async function disconnectAccount(accountId: string): Promise<void> {
  const { workspace, session, role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { broker: ["manage"] })) return;

  // Scope the delete to this workspace — accountId alone isn't enough to
  // trust from a client call, since it's just a UUID passed back to us.
  const [row] = await db
    .select({ label: brokerAccounts.label })
    .from(brokerAccounts)
    .where(and(eq(brokerAccounts.id, accountId), eq(brokerAccounts.workspaceId, workspace.id)))
    .limit(1);
  if (!row) return;

  await db
    .delete(brokerAccounts)
    .where(and(eq(brokerAccounts.id, accountId), eq(brokerAccounts.workspaceId, workspace.id)));

  await logAudit({
    workspaceId: workspace.id,
    actorId: session.user.id,
    action: "broker.disconnected",
    summary: `Disconnected broker account "${row.label}"`,
  });

  revalidatePath("/dashboard/settings");
}

async function assertOwnedAccount(workspaceId: string, accountId: string) {
  const [row] = await db
    .select({ id: brokerAccounts.id })
    .from(brokerAccounts)
    .where(and(eq(brokerAccounts.id, accountId), eq(brokerAccounts.workspaceId, workspaceId)))
    .limit(1);
  return row !== undefined;
}

export async function syncAccount(accountId: string): Promise<{ error?: string }> {
  const { workspace, role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { broker: ["manage"] })) {
    return { error: "You don't have permission to sync broker accounts." };
  }

  const [row] = await db
    .select({ provider: brokerAccounts.provider, status: brokerAccounts.status })
    .from(brokerAccounts)
    .where(and(eq(brokerAccounts.id, accountId), eq(brokerAccounts.workspaceId, workspace.id)))
    .limit(1);
  if (!row) return { error: "Account not found." };

  try {
    const runner = await getRunner(row.provider);
    const balance = await runner.getBalance(accountId);
    const nextStatus = row.status === "whitelist_pending" ? "whitelist_pending" : "connected";

    await db
      .update(brokerAccounts)
      .set({
        balance: balance.balance.toFixed(2),
        equity: balance.equity.toFixed(2),
        currency: balance.currency,
        // See syncAllBrokerAccounts — absent details must not clear stored ones.
        ...(balance.details ? { metadata: balance.details } : {}),
        status: nextStatus,
        lastSyncAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(brokerAccounts.id, accountId));

    try {
      await syncPositions(accountId, workspace.id, row.provider);
    } catch {
      // swallow — balance sync above already succeeded for this account
    }
  } catch (error) {
    await markAccountStatus(accountId, "needs_reauth");
    return { error: error instanceof Error ? error.message : "Sync failed." };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/monarch/indian-equity");
  revalidatePath("/dashboard/monarch/indian-options");
  return {};
}

export async function reauthorizeAccount(accountId: string): Promise<void> {
  const { workspace, session, role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { broker: ["manage"] })) return;
  if (!(await assertOwnedAccount(workspace.id, accountId))) return;

  await markAccountStatus(accountId, "needs_reauth");
  await logAudit({
    workspaceId: workspace.id,
    actorId: session.user.id,
    action: "broker.reauth_requested",
    summary: `Requested re-authorization for broker account ${accountId}`,
  });
  revalidatePath("/dashboard/settings");
}

/**
 * Independent of connection `status` — this is the trader-facing kill
 * switch (blocks new order placement without touching stored credentials).
 * Every flip is audited on its own action name so the log reads the same
 * way the reference app's does ("connection.enabled" / ".disabled"),
 * distinct from connect/disconnect.
 */
export async function toggleAccountEnabled(accountId: string): Promise<void> {
  const { workspace, session, role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { broker: ["manage"] })) return;

  const [row] = await db
    .select({ enabled: brokerAccounts.enabled, label: brokerAccounts.label })
    .from(brokerAccounts)
    .where(and(eq(brokerAccounts.id, accountId), eq(brokerAccounts.workspaceId, workspace.id)))
    .limit(1);
  if (!row) return;

  const next = !row.enabled;
  await db
    .update(brokerAccounts)
    .set({ enabled: next, updatedAt: new Date() })
    .where(eq(brokerAccounts.id, accountId));

  await logAudit({
    workspaceId: workspace.id,
    actorId: session.user.id,
    action: next ? "broker.enabled" : "broker.disabled",
    summary: `${next ? "Enabled" : "Disabled"} broker account "${row.label}"`,
  });
  revalidatePath("/dashboard/settings");
}

/** Pauses/resumes this account's contribution to the shared position-sync poll, independent of `enabled`. */
export async function togglePositionSync(accountId: string): Promise<void> {
  const { workspace, session, role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { broker: ["manage"] })) return;

  const [row] = await db
    .select({ positionSyncEnabled: brokerAccounts.positionSyncEnabled, label: brokerAccounts.label })
    .from(brokerAccounts)
    .where(and(eq(brokerAccounts.id, accountId), eq(brokerAccounts.workspaceId, workspace.id)))
    .limit(1);
  if (!row) return;

  const next = !row.positionSyncEnabled;
  await db
    .update(brokerAccounts)
    .set({ positionSyncEnabled: next, updatedAt: new Date() })
    .where(eq(brokerAccounts.id, accountId));

  await logAudit({
    workspaceId: workspace.id,
    actorId: session.user.id,
    action: next ? "broker.position_sync_enabled" : "broker.position_sync_disabled",
    summary: `${next ? "Enabled" : "Disabled"} broker position sync for "${row.label}"`,
  });
  revalidatePath("/dashboard/settings");
}

/**
 * Live TOTP code for an account that has a totpSecret on file — lets a
 * member copy the current code while reauthorizing on the broker's own
 * site, without needing a separate authenticator app open. Returns null if
 * no secret is stored for this account.
 */
export async function getAccountOtp(
  accountId: string,
): Promise<{ code: string; secondsRemaining: number } | null> {
  const { workspace, role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { broker: ["manage"] })) return null;
  if (!(await assertOwnedAccount(workspace.id, accountId))) return null;

  const { credentials } = await getStoredCredentials(accountId);
  const secret = credentials.totpSecret;
  if (!secret) return null;

  return { code: generateTotp(secret), secondsRemaining: totpSecondsRemaining() };
}

/**
 * There's no API on any of these brokers that reports whether an IP is
 * actually whitelisted — this is the user confirming they've done that step
 * on the broker's own dashboard, not something we can verify ourselves.
 */
export async function markAccountWhitelisted(accountId: string): Promise<void> {
  const { workspace, session, role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { broker: ["manage"] })) return;
  if (!(await assertOwnedAccount(workspace.id, accountId))) return;

  await markAccountStatus(accountId, "connected");
  await logAudit({
    workspaceId: workspace.id,
    actorId: session.user.id,
    action: "broker.whitelisted",
    summary: `Confirmed IP whitelisting for broker account ${accountId}`,
  });
  revalidatePath("/dashboard/settings");
}
