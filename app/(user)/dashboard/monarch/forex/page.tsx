import { requireActiveWorkspace } from "@/lib/auth/session";
import { TradingModulePage } from "@/components/trading-module/trading-module-page";
import { getPositions, computeKpis, computePnlPoints } from "@/lib/positions/queries";
import { getTradingSettings, saveTradingSettings, closePositions } from "@/lib/positions/actions";

export default async function ForexPage() {
  const { workspace } = await requireActiveWorkspace();

  const [positions, settings] = await Promise.all([
    getPositions(workspace.id, "forex"),
    getTradingSettings("forex"),
  ]);

  return (
    <TradingModulePage
      market="forex"
      title="Forex Trading"
      subtitle="MetaAPI-backed position monitoring across connected MT5 accounts."
      currency="USD"
      kpis={computeKpis(positions)}
      pnlPoints={computePnlPoints(positions)}
      positions={positions}
      settings={settings}
      saveSettingsAction={saveTradingSettings.bind(null, "forex")}
      closePositionsAction={closePositions}
    />
  );
}
