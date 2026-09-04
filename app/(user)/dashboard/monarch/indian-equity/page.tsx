import { requireActiveWorkspace } from "@/lib/auth/session";
import { EquityHoldingsPage } from "@/components/trading-module/equity-holdings-page";
import { getPositions, computeKpis, getIndianBrokerBalance, resolveCurrency } from "@/lib/positions/queries";

export default async function IndianEquityPage() {
  const { workspace } = await requireActiveWorkspace();

  const [positions, availableBalance] = await Promise.all([
    getPositions(workspace.id, "indian_equity"),
    getIndianBrokerBalance(workspace.id),
  ]);

  const { currency, totalsRows } = resolveCurrency(positions, "INR");

  return (
    <EquityHoldingsPage
      title="Indian Equity"
      subtitle="Cash-equity holdings synced from Dhan/Motilal Oswal — view-only, Aether does not manage or exit these."
      currency={currency}
      kpis={computeKpis(totalsRows)}
      positions={positions}
      availableBalance={availableBalance}
    />
  );
}
