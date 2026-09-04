import { requireActiveWorkspace } from "@/lib/auth/session";
import { TradingModulePage } from "@/components/trading-module/trading-module-page";
import { getPositions, computeKpis, computePnlPoints, resolveCurrency } from "@/lib/positions/queries";
import { getTradingSettings, saveTradingSettings, closePositions } from "@/lib/positions/actions";

export default async function ForexPage() {
  const { workspace } = await requireActiveWorkspace();

  const [positions, settings] = await Promise.all([
    getPositions(workspace.id, "forex"),
    getTradingSettings("forex"),
  ]);

  // MT5 accounts are not all dollar-denominated — this workspace holds both
  // INR and USD ones — so the page's currency comes from the positions, and
  // totals are computed over a single currency's rows only.
  const { currency, totalsRows, excluded } = resolveCurrency(positions, "USD");

  return (
    <TradingModulePage
      market="forex"
      title="Forex Trading"
      subtitle="MetaAPI-backed position monitoring across connected MT5 accounts."
      currency={currency}
      excludedFromTotals={excluded}
      kpis={computeKpis(totalsRows)}
      pnlPoints={computePnlPoints(totalsRows)}
      positions={positions}
      settings={settings}
      saveSettingsAction={saveTradingSettings.bind(null, "forex")}
      closePositionsAction={closePositions}
    />
  );
}
