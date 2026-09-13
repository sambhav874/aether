"use server";

import { headers } from "next/headers";
import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { notificationPreferences, auditLog, user } from "@/db/schema";
import { requireActiveWorkspace } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { emailSchema } from "@/lib/validation";
import { parseInput } from "@/lib/strategies/schemas";
import { auth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit/log";

export type NotificationPrefs = {
  signalAlerts: boolean;
  brokerDisconnected: boolean;
  strategyPaused: boolean;
  securityAlerts: boolean;
};

const DEFAULT_PREFS: NotificationPrefs = {
  signalAlerts: true,
  brokerDisconnected: true,
  strategyPaused: true,
  securityAlerts: true,
};

export async function getNotificationPreferences(): Promise<NotificationPrefs> {
  const { workspace, session } = await requireActiveWorkspace();

  const [row] = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.workspaceId, workspace.id),
        eq(notificationPreferences.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!row) return DEFAULT_PREFS;
  return {
    signalAlerts: row.signalAlerts,
    brokerDisconnected: row.brokerDisconnected,
    strategyPaused: row.strategyPaused,
    securityAlerts: row.securityAlerts,
  };
}

export async function saveNotificationPreferences(prefs: NotificationPrefs): Promise<void> {
  const { workspace, session } = await requireActiveWorkspace();

  await db
    .insert(notificationPreferences)
    .values({
      id: crypto.randomUUID(),
      workspaceId: workspace.id,
      userId: session.user.id,
      ...prefs,
    })
    .onConflictDoUpdate({
      target: [notificationPreferences.workspaceId, notificationPreferences.userId],
      set: { ...prefs, updatedAt: new Date() },
    });

  await logAudit({
    workspaceId: workspace.id,
    actorId: session.user.id,
    action: "notifications.preferences_updated",
    summary: "Updated notification preferences",
  });

  revalidatePath("/dashboard/settings");
}

export type GeneralSettingsState = { error?: string; success?: boolean };

export async function updateWorkspaceGeneral(
  _prev: GeneralSettingsState,
  formData: FormData,
): Promise<GeneralSettingsState> {
  const { workspace, session } = await requireActiveWorkspace();

  const name = formData.get("name");
  if (typeof name !== "string" || name.trim().length === 0) {
    return { error: "Workspace name is required." };
  }

  try {
    await auth.api.updateOrganization({
      headers: await headers(),
      body: { organizationId: workspace.id, data: { name: name.trim() } },
    });
    await logAudit({
      workspaceId: workspace.id,
      actorId: session.user.id,
      action: "workspace.renamed",
      summary: `Renamed workspace to "${name.trim()}"`,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update workspace." };
  }

  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function inviteMember(email: string, role: string): Promise<{ error?: string }> {
  const checkedEmail = parseInput(emailSchema, email);
  if (!checkedEmail.ok) return { error: "Enter a valid email address." };
  // Role is a key into the permission catalogue; an unknown string must not
  // reach the auth API and become a member with undefined permissions.
  if (!(role in ROLE_LABELS)) return { error: "Unknown role." };
  email = checkedEmail.data;

  const { workspace, session } = await requireActiveWorkspace();

  try {
    await auth.api.createInvitation({
      headers: await headers(),
      body: { email, role: role as "owner" | "admin" | "trader" | "viewer", organizationId: workspace.id },
    });
    await logAudit({
      workspaceId: workspace.id,
      actorId: session.user.id,
      action: "member.invited",
      summary: `Invited ${email} as ${role}`,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not send invitation." };
  }

  revalidatePath("/dashboard/settings");
  return {};
}

export async function cancelInvitation(invitationId: string): Promise<void> {
  const { workspace, session } = await requireActiveWorkspace();
  await auth.api.cancelInvitation({ headers: await headers(), body: { invitationId } });
  await logAudit({
    workspaceId: workspace.id,
    actorId: session.user.id,
    action: "member.invitation_cancelled",
    summary: `Cancelled a pending invitation`,
  });
  revalidatePath("/dashboard/settings");
}

export async function removeMember(memberIdOrEmail: string): Promise<void> {
  const { workspace, session } = await requireActiveWorkspace();
  await auth.api.removeMember({
    headers: await headers(),
    body: { memberIdOrEmail, organizationId: workspace.id },
  });
  await logAudit({
    workspaceId: workspace.id,
    actorId: session.user.id,
    action: "member.removed",
    summary: `Removed a workspace member`,
  });
  revalidatePath("/dashboard/settings");
}

export async function updateMemberRole(memberId: string, role: string): Promise<void> {
  const { workspace, session } = await requireActiveWorkspace();
  await auth.api.updateMemberRole({
    headers: await headers(),
    body: { memberId, role: role as "owner" | "admin" | "trader" | "viewer", organizationId: workspace.id },
  });
  await logAudit({
    workspaceId: workspace.id,
    actorId: session.user.id,
    action: "member.role_changed",
    summary: `Changed a member's role to ${role}`,
  });
  revalidatePath("/dashboard/settings");
}

export async function getAuditLog(limit = 100) {
  const { workspace } = await requireActiveWorkspace();
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      summary: auditLog.summary,
      status: auditLog.status,
      occurredAt: auditLog.occurredAt,
      actorId: auditLog.actorId,
      actorName: user.name,
    })
    .from(auditLog)
    .leftJoin(user, eq(auditLog.actorId, user.id))
    .where(eq(auditLog.workspaceId, workspace.id))
    .orderBy(desc(auditLog.occurredAt))
    .limit(limit);
}
