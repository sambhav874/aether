import { requireActiveWorkspace } from "@/lib/auth/session";
import { TradingModulePage } from "@/components/trading-module/trading-module-page";
import {
  getPositions,
  computeKpis,
  computePnlPoints,
  getIndianBrokerBalance,
} from "@/lib/positions/queries";
import { getTradingSettings, saveTradingSettings, closePositions } from "@/lib/positions/actions";

export default async function IndianOptionsPage() {
  const { workspace } = await requireActiveWorkspace();

  const [positions, settings, availableBalance] = await Promise.all([
    getPositions(workspace.id, "indian_options"),
    getTradingSettings("indian_options"),
    getIndianBrokerBalance(workspace.id),
  ]);

  return (
    <TradingModulePage
      market="indian_options"
      title="Indian Options"
      subtitle="NSE F&O monitoring across connected Zerodha, Dhan, and Motilal Oswal accounts."
      currency="INR"
      kpis={computeKpis(positions)}
      pnlPoints={computePnlPoints(positions)}
      positions={positions}
      settings={settings}
      saveSettingsAction={saveTradingSettings.bind(null, "indian_options")}
      closePositionsAction={closePositions}
      availableBalance={availableBalance}
    />
  );
}
