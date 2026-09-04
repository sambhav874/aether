import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { brokerAccounts } from "@/db/schema";
import { decryptCredentials, encryptCredentials } from "@/lib/crypto";
import type { BrokerProvider, ConnectionStatus } from "@/lib/runners/types";

export type StoredAccount = {
  externalAccountId: string;
  credentials: Record<string, string>;
};

/**
 * Looks up a broker account by OUR internal id (broker_accounts.id), never
 * by (provider, externalAccountId) alone — the same external account can
 * be connected into more than one workspace, so that pair isn't a safe key.
 */
export async function getStoredCredentials(accountId: string): Promise<StoredAccount> {
  const [row] = await db
    .select({
      externalAccountId: brokerAccounts.externalAccountId,
      credentialsEncrypted: brokerAccounts.credentialsEncrypted,
    })
    .from(brokerAccounts)
    .where(eq(brokerAccounts.id, accountId))
    .limit(1);

  if (!row?.credentialsEncrypted) {
    throw new Error(
      `No stored credentials for broker account ${accountId} — reconnect it in Settings > Integrations.`,
    );
  }

  return {
    externalAccountId: row.externalAccountId,
    credentials: decryptCredentials(row.credentialsEncrypted),
  };
}

export async function saveAccountCredentials(params: {
  workspaceId: string;
  provider: BrokerProvider;
  externalAccountId: string;
  label: string;
  status: ConnectionStatus;
  credentials: Record<string, string>;
  staticIp?: string | null;
}): Promise<{ id: string }> {
  const encrypted = encryptCredentials(params.credentials);
  const staticIp = params.staticIp ?? null;

  const [row] = await db
    .insert(brokerAccounts)
    .values({
      id: crypto.randomUUID(),
      workspaceId: params.workspaceId,
      provider: params.provider,
      externalAccountId: params.externalAccountId,
      label: params.label,
      status: params.status,
      staticIp,
      credentialsEncrypted: encrypted,
    })
    .onConflictDoUpdate({
      target: [
        brokerAccounts.workspaceId,
        brokerAccounts.provider,
        brokerAccounts.externalAccountId,
      ],
      set: {
        label: params.label,
        status: params.status,
        staticIp,
        credentialsEncrypted: encrypted,
        updatedAt: new Date(),
      },
    })
    .returning({ id: brokerAccounts.id });

  return row;
}

/**
 * Rewrites the encrypted credential blob for one account in place — used
 * when an adapter mints a fresh session token for itself (Motilal's auth
 * token dies at 6 AM daily), so the next request doesn't have to log in
 * again. Everything else about the account row is left alone.
 */
export async function updateStoredCredentials(
  accountId: string,
  credentials: Record<string, string>,
): Promise<void> {
  await db
    .update(brokerAccounts)
    .set({ credentialsEncrypted: encryptCredentials(credentials), updatedAt: new Date() })
    .where(eq(brokerAccounts.id, accountId));
}

export async function markAccountStatus(accountId: string, status: ConnectionStatus) {
  await db
    .update(brokerAccounts)
    .set({ status, updatedAt: new Date() })
    .where(eq(brokerAccounts.id, accountId));
}
