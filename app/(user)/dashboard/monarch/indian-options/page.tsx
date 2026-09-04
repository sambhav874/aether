import { requireActiveWorkspace } from "@/lib/auth/session";
import { TradingModulePage } from "@/components/trading-module/trading-module-page";
import {
  getPositions,
  computeKpis,
  computePnlPoints,
  getIndianBrokerBalance,
  resolveCurrency,
} from "@/lib/positions/queries";
import { getTradingSettings, saveTradingSettings, closePositions } from "@/lib/positions/actions";

export default async function IndianOptionsPage() {
  const { workspace } = await requireActiveWorkspace();

  const [positions, settings, availableBalance] = await Promise.all([
    getPositions(workspace.id, "indian_options"),
    getTradingSettings("indian_options"),
    getIndianBrokerBalance(workspace.id),
  ]);

  const { currency, totalsRows, excluded } = resolveCurrency(positions, "INR");

  return (
    <TradingModulePage
      market="indian_options"
      title="Indian Options"
      subtitle="NSE F&O monitoring across connected Zerodha, Dhan, and Motilal Oswal accounts."
      currency={currency}
      excludedFromTotals={excluded}
      kpis={computeKpis(totalsRows)}
      pnlPoints={computePnlPoints(totalsRows)}
      positions={positions}
      settings={settings}
      saveSettingsAction={saveTradingSettings.bind(null, "indian_options")}
      closePositionsAction={closePositions}
      availableBalance={availableBalance}
    />
  );
}
