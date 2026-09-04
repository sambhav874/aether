import "server-only";
import { revalidatePath } from "next/cache";
import { requireActiveWorkspace } from "@/lib/auth/session";
import { hasWorkspacePermission } from "@/lib/auth/permissions";
import { getRunner, saveAccountCredentials } from "@/lib/runners";
import { syncPositions } from "@/lib/runners/sync";
import type { BrokerProvider } from "@/lib/runners/types";
import { db } from "@/db/client";
import { brokerAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit/log";

export type ConnectActionState = { error?: string; success?: boolean };

// SEBI requires Indian broker order placement to originate from a static,
// whitelisted IP. MetaAPI is exempt (cloud-hosted, its own compliance) — the
// other three land in whitelist_pending regardless of what the broker's auth
// call itself returned, since a successful login says nothing about whether
// this IP is actually whitelisted on the broker's side yet.
function requiresIpWhitelisting(provider: BrokerProvider) {
  return provider !== "metaapi";
}

export async function connectBrokerAccount(
  provider: BrokerProvider,
  credentials: Record<string, string>,
): Promise<ConnectActionState> {
  const { workspace, session, role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { broker: ["connect"] })) {
    return { error: "You don't have permission to connect broker accounts." };
  }

  try {
    const runner = await getRunner(provider);
    const result = await runner.connectAccount(credentials);
    const needsWhitelisting = requiresIpWhitelisting(provider);
    // A user-chosen label (Dhan/Motilal's "Label (optional)" field) wins
    // over the runner's auto-generated `Provider clientId` default.
    const label = credentials.label?.trim() || result.account.label;

    const { id: accountId } = await saveAccountCredentials({
      workspaceId: workspace.id,
      provider,
      externalAccountId: result.account.externalAccountId,
      label,
      status: needsWhitelisting ? "whitelist_pending" : result.account.status,
      staticIp: needsWhitelisting ? (process.env.BROKER_RUNNER_STATIC_IP ?? null) : null,
      credentials: result.credentials,
    });

    // Populate balance immediately so it shows on connect instead of
    // waiting for the next scheduled sync (syncAllBrokerAccounts).
    try {
      const balance = await runner.getBalance(accountId);
      await db
        .update(brokerAccounts)
        .set({
          balance: balance.balance.toFixed(2),
          equity: balance.equity.toFixed(2),
          currency: balance.currency,
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(brokerAccounts.id, accountId));
    } catch {
      // Non-fatal — account stays connected, balance fills in on next sync.
    }

    // Same treatment for existing holdings/positions at the broker — so an
    // account with pre-existing assets shows them right away, not just after
    // the next cron sync.
    try {
      await syncPositions(accountId, workspace.id, provider);
    } catch {
      // Non-fatal — positions fill in on next sync.
    }

    await logAudit({
      workspaceId: workspace.id,
      actorId: session.user.id,
      action: "broker.connected",
      summary: `Connected ${provider} account "${label}"`,
    });
  } catch (error) {
    await logAudit({
      workspaceId: workspace.id,
      actorId: session.user.id,
      action: "broker.connect_failed",
      summary: `Failed to connect ${provider} account: ${error instanceof Error ? error.message : "unknown error"}`,
      status: "failure",
    });
    return { error: error instanceof Error ? error.message : "Connection failed." };
  }

  revalidatePath("/dashboard/settings");
  return { success: true };
}
