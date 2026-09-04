import { requireActiveWorkspace } from "@/lib/auth/session";
import { EquityHoldingsPage } from "@/components/trading-module/equity-holdings-page";
import { getPositions, computeKpis, getIndianBrokerBalance } from "@/lib/positions/queries";

export default async function IndianEquityPage() {
  const { workspace } = await requireActiveWorkspace();

  const [positions, availableBalance] = await Promise.all([
    getPositions(workspace.id, "indian_equity"),
    getIndianBrokerBalance(workspace.id),
  ]);

  return (
    <EquityHoldingsPage
      title="Indian Equity"
      subtitle="Cash-equity holdings synced from Dhan/Motilal Oswal — view-only, Aether does not manage or exit these."
      currency="INR"
      kpis={computeKpis(positions)}
      positions={positions}
      availableBalance={availableBalance}
    />
  );
}
