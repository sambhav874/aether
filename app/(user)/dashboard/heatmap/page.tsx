import { getCryptoHeatmap } from "@/lib/heatmap/coingecko";
import { getYahooHeatmap } from "@/lib/heatmap/yahoo";
import { HeatmapPage } from "@/components/heatmap/heatmap-page";

export default async function Heatmap() {
  const [crypto, usEquity, indiaFno, indiaEquity, indiaBroad, commodities, forex] = await Promise.all([
    getCryptoHeatmap(),
    getYahooHeatmap("us_equity"),
    getYahooHeatmap("india_fno"),
    getYahooHeatmap("india_equity"),
    getYahooHeatmap("india_broad"),
    getYahooHeatmap("commodities"),
    getYahooHeatmap("forex"),
  ]);

  return (
    <HeatmapPage
      crypto={crypto}
      usEquity={usEquity}
      indiaFno={indiaFno}
      indiaEquity={indiaEquity}
      indiaBroad={indiaBroad}
      commodities={commodities}
      forex={forex}
    />
  );
}
