import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { strategyAccounts, brokerAccounts } from "@/db/schema";

export type LinkableAccount = {
  id: string;
  label: string;
  provider: (typeof brokerAccounts.$inferSelect)["provider"];
  status: (typeof brokerAccounts.$inferSelect)["status"];
};

export async function getWorkspaceAccounts(workspaceId: string): Promise<LinkableAccount[]> {
  return db
    .select({
      id: brokerAccounts.id,
      label: brokerAccounts.label,
      provider: brokerAccounts.provider,
      status: brokerAccounts.status,
    })
    .from(brokerAccounts)
    .where(eq(brokerAccounts.workspaceId, workspaceId));
}

export async function getLinkedAccountIds(strategyId: string): Promise<string[]> {
  const rows = await db
    .select({ accountId: strategyAccounts.accountId })
    .from(strategyAccounts)
    .where(eq(strategyAccounts.strategyId, strategyId));
  return rows.map((r) => r.accountId);
}
