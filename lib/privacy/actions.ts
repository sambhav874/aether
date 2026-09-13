"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db/client";
import {
  auditLog,
  brokerAccounts,
  notificationPreferences,
  positions,
  strategies,
  telegramConnections,
  userRssFeeds,
} from "@/db/schema";
import { requireActiveWorkspace } from "@/lib/auth/session";
import { auth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit/log";

/**
 * Data access and erasure, as India's DPDP Act 2023 requires of a data
 * fiduciary. Neither existed before, on a product holding broker credentials
 * and a full trade history.
 */

export type ExportBundle = Record<string, unknown>;

/**
 * Everything held about the caller in the active workspace, as JSON.
 *
 * Broker credentials are deliberately excluded. They are encrypted at rest,
 * and handing them back in plaintext would turn a privacy feature into a
 * credential-exfiltration route; the account's identity and status are
 * included so the subject can still see what is connected.
 */
export async function exportMyData(): Promise<ExportBundle> {
  const { workspace, session } = await requireActiveWorkspace();
  const workspaceId = workspace.id;

  const [strategyRows, positionRows, accountRows, feedRows, telegramRows, notificationRows, auditRows] =
    await Promise.all([
      db.select().from(strategies).where(eq(strategies.workspaceId, workspaceId)),
      db.select().from(positions).where(eq(positions.workspaceId, workspaceId)),
      db
        .select({
          id: brokerAccounts.id,
          provider: brokerAccounts.provider,
          label: brokerAccounts.label,
          status: brokerAccounts.status,
          createdAt: brokerAccounts.createdAt,
        })
        .from(brokerAccounts)
        .where(eq(brokerAccounts.workspaceId, workspaceId)),
      db.select().from(userRssFeeds).where(eq(userRssFeeds.userId, session.user.id)),
      db.select().from(telegramConnections).where(eq(telegramConnections.workspaceId, workspaceId)),
      db
        .select()
        .from(notificationPreferences)
        .where(
          and(
            eq(notificationPreferences.workspaceId, workspaceId),
            eq(notificationPreferences.userId, session.user.id),
          ),
        ),
      db.select().from(auditLog).where(eq(auditLog.workspaceId, workspaceId)),
    ]);

  // Strategy rows carry the webhook secret. It is a live credential, not
  // personal data, and an export file is the last place it should travel.
  const safeStrategies = strategyRows.map(({ webhookSecret: _omitted, ...rest }) => rest);

  await logAudit({
    workspaceId,
    actorId: session.user.id,
    action: "privacy.data_exported",
    summary: "Exported workspace data",
  });

  return {
    exportedAt: new Date().toISOString(),
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
    workspace: { id: workspace.id, name: workspace.name },
    strategies: safeStrategies,
    positions: positionRows,
    brokerAccounts: accountRows,
    rssFeeds: feedRows,
    telegramConnections: telegramRows,
    notificationPreferences: notificationRows,
    auditLog: auditRows,
  };
}

/**
 * Erases the caller's account.
 *
 * Broker accounts are deleted first and explicitly rather than left to the
 * cascade: those rows hold encrypted API credentials, and they are the one
 * thing that must be gone even if a later step fails.
 *
 * Open positions block deletion. Removing the record of a live position does
 * not close it at the broker — it only removes your ability to see it.
 */
export async function deleteMyAccount(confirmation: string): Promise<{ error?: string }> {
  const { workspace, session } = await requireActiveWorkspace();

  if (confirmation.trim().toUpperCase() !== "DELETE") {
    return { error: "Type DELETE to confirm." };
  }

  const open = await db
    .select({ id: positions.id })
    .from(positions)
    .where(and(eq(positions.workspaceId, workspace.id), eq(positions.status, "open")))
    .limit(1);

  if (open.length > 0) {
    return {
      error:
        "Close your open positions first. Deleting your account here does not close them at the broker — it only removes your view of them.",
    };
  }

  await db.delete(brokerAccounts).where(eq(brokerAccounts.workspaceId, workspace.id));

  await logAudit({
    workspaceId: workspace.id,
    actorId: session.user.id,
    action: "privacy.account_deleted",
    summary: `Account deletion requested by ${session.user.email}`,
  });

  await auth.api.deleteUser({ headers: await headers(), body: {} });

  return {};
}
