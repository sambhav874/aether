import { requireActiveWorkspace } from "@/lib/auth/session";
import { getAllPositions } from "@/lib/positions/queries";
import { getWorkspaceAccounts } from "@/lib/strategies/accounts";
import { PerformancePage } from "@/components/performance/performance-page";

export default async function Performance() {
  const { workspace } = await requireActiveWorkspace();

  const [positions, accounts] = await Promise.all([
    getAllPositions(workspace.id),
    getWorkspaceAccounts(workspace.id),
  ]);

  return <PerformancePage positions={positions} accounts={accounts} />;
}
