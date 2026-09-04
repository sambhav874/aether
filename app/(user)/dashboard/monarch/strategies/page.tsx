import { requireActiveWorkspace } from "@/lib/auth/session";
import { getStrategies } from "@/lib/strategies/queries";
import { getWorkspaceAccounts } from "@/lib/strategies/accounts";
import { getViewableStrategyIds, filterViewableIds, resolveStrategyPermission } from "@/lib/strategies/permissions";
import { StrategyList } from "@/components/strategies/strategy-list";

export default async function StrategiesPage() {
  const { workspace, session, role } = await requireActiveWorkspace();
  const [allStrategies, accounts] = await Promise.all([
    getStrategies(workspace.id),
    getWorkspaceAccounts(workspace.id),
  ]);

  const viewable = await getViewableStrategyIds(workspace.id, session.user.id, role);
  const visibleIds = filterViewableIds(
    allStrategies.map((s) => s.id),
    viewable,
  );
  const visibleIdSet = new Set(visibleIds);
  const strategies = allStrategies.filter((s) => visibleIdSet.has(s.id));

  const permissionEntries = await Promise.all(
    strategies.map(async (s) => [s.id, await resolveStrategyPermission(session.user.id, role, s.id)] as const),
  );
  const permissions = Object.fromEntries(permissionEntries);

  return (
    <div className="space-y-1">
      <h1 className="font-display text-3xl font-medium tracking-tight">Trading strategies</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Monitor, configure, and route signals from your automated strategies.
      </p>
      <StrategyList strategies={strategies} accounts={accounts} permissions={permissions} />
    </div>
  );
}
