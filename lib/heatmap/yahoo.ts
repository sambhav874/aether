import type { MarketHeatmapEntry, MarketHeatmapResult } from "@/lib/heatmap/types";

export type YahooHeatmapCategory =
  | "us_equity"
  | "india_fno"
  | "india_equity"
  | "india_broad"
  | "commodities"
  | "forex";

// Static curated lists — the free unofficial Yahoo endpoint has no "give me
// the top 50 by market cap" query, so the universe per category is hardcoded
// and will drift out of date over time. Fine for a v1; a real vendor (Twelve
// Data/Finnhub/etc) would replace this with an actual constituents query.
// Exported so lib/ai/screening/refresh-fundamentals.ts can reuse these same
// curated, already-reviewed lists as the screen_stocks universe rather than
// maintaining (or fabricating) a second symbol list — see that module's
// docstring for why "nifty50"/"sp500" aren't real constituent lists here.
export const SYMBOLS: Record<YahooHeatmapCategory, { symbol: string; name: string }[]> = {
  us_equity: [
    ["AAPL", "Apple"], ["MSFT", "Microsoft"], ["GOOGL", "Alphabet"], ["AMZN", "Amazon"],
    ["NVDA", "NVIDIA"], ["META", "Meta Platforms"], ["TSLA", "Tesla"], ["BRK-B", "Berkshire Hathaway"],
    ["LLY", "Eli Lilly"], ["AVGO", "Broadcom"], ["V", "Visa"], ["JPM", "JPMorgan Chase"],
    ["UNH", "UnitedHealth"], ["XOM", "Exxon Mobil"], ["MA", "Mastercard"], ["PG", "Procter & Gamble"],
    ["COST", "Costco"], ["HD", "Home Depot"], ["MRK", "Merck"], ["ABBV", "AbbVie"],
    ["CVX", "Chevron"], ["ADBE", "Adobe"], ["CRM", "Salesforce"], ["AMD", "AMD"],
    ["PEP", "PepsiCo"], ["KO", "Coca-Cola"], ["WMT", "Walmart"], ["MCD", "McDonald's"],
    ["CSCO", "Cisco"], ["TMO", "Thermo Fisher"], ["ACN", "Accenture"], ["LIN", "Linde"],
    ["ABT", "Abbott Labs"], ["NFLX", "Netflix"], ["DHR", "Danaher"], ["WFC", "Wells Fargo"],
    ["TXN", "Texas Instruments"], ["DIS", "Disney"], ["PM", "Philip Morris"], ["INTU", "Intuit"],
    ["VZ", "Verizon"], ["CMCSA", "Comcast"], ["AMGN", "Amgen"], ["IBM", "IBM"],
    ["NOW", "ServiceNow"], ["CAT", "Caterpillar"], ["GE", "GE Aerospace"], ["UBER", "Uber"],
    ["QCOM", "Qualcomm"], ["SPGI", "S&P Global"],
  ].map(([symbol, name]) => ({ symbol, name })),
  india_fno: [
    ["RELIANCE.NS", "Reliance Industries"], ["TCS.NS", "TCS"], ["HDFCBANK.NS", "HDFC Bank"],
    ["ICICIBANK.NS", "ICICI Bank"], ["INFY.NS", "Infosys"], ["ITC.NS", "ITC"],
    ["SBIN.NS", "State Bank of India"], ["BHARTIARTL.NS", "Bharti Airtel"], ["LT.NS", "Larsen & Toubro"],
    ["KOTAKBANK.NS", "Kotak Mahindra Bank"], ["AXISBANK.NS", "Axis Bank"], ["HINDUNILVR.NS", "Hindustan Unilever"],
    ["BAJFINANCE.NS", "Bajaj Finance"], ["MARUTI.NS", "Maruti Suzuki"], ["SUNPHARMA.NS", "Sun Pharma"],
    ["TITAN.NS", "Titan Company"], ["ULTRACEMCO.NS", "UltraTech Cement"], ["ASIANPAINT.NS", "Asian Paints"],
    ["NESTLEIND.NS", "Nestle India"], ["WIPRO.NS", "Wipro"], ["HCLTECH.NS", "HCL Technologies"],
    ["ADANIENT.NS", "Adani Enterprises"], ["ADANIPORTS.NS", "Adani Ports"], ["ONGC.NS", "ONGC"],
    ["NTPC.NS", "NTPC"], ["POWERGRID.NS", "Power Grid Corp"], ["M&M.NS", "Mahindra & Mahindra"],
    ["TATAMOTORS.NS", "Tata Motors"], ["TATASTEEL.NS", "Tata Steel"], ["JSWSTEEL.NS", "JSW Steel"],
    ["HINDALCO.NS", "Hindalco"], ["COALINDIA.NS", "Coal India"], ["BAJAJFINSV.NS", "Bajaj Finserv"],
    ["BAJAJ-AUTO.NS", "Bajaj Auto"], ["DRREDDY.NS", "Dr Reddy's Labs"], ["CIPLA.NS", "Cipla"],
    ["DIVISLAB.NS", "Divi's Labs"], ["GRASIM.NS", "Grasim Industries"], ["INDUSINDBK.NS", "IndusInd Bank"],
    ["SBILIFE.NS", "SBI Life Insurance"], ["HDFCLIFE.NS", "HDFC Life Insurance"], ["TECHM.NS", "Tech Mahindra"],
    ["BRITANNIA.NS", "Britannia Industries"], ["EICHERMOT.NS", "Eicher Motors"], ["HEROMOTOCO.NS", "Hero MotoCorp"],
    ["SHREECEM.NS", "Shree Cement"], ["UPL.NS", "UPL"], ["VEDL.NS", "Vedanta"],
    ["PIDILITIND.NS", "Pidilite Industries"], ["DLF.NS", "DLF"],
  ].map(([symbol, name]) => ({ symbol, name })),
  india_equity: [
    ["TRENT.NS", "Trent"], ["PAGEIND.NS", "Page Industries"], ["MUTHOOTFIN.NS", "Muthoot Finance"],
    ["ABCAPITAL.NS", "Aditya Birla Capital"], ["LUPIN.NS", "Lupin"], ["AUROPHARMA.NS", "Aurobindo Pharma"],
    ["BANDHANBNK.NS", "Bandhan Bank"], ["IDFCFIRSTB.NS", "IDFC First Bank"], ["FEDERALBNK.NS", "Federal Bank"],
    ["PNB.NS", "Punjab National Bank"], ["BANKBARODA.NS", "Bank of Baroda"], ["CANBK.NS", "Canara Bank"],
    ["GODREJPROP.NS", "Godrej Properties"], ["OBEROIRLTY.NS", "Oberoi Realty"], ["LICHSGFIN.NS", "LIC Housing Finance"],
    ["CHOLAFIN.NS", "Cholamandalam Finance"], ["MFSL.NS", "Max Financial Services"], ["INDIGO.NS", "InterGlobe Aviation"],
    ["IRCTC.NS", "IRCTC"], ["ZOMATO.NS", "Zomato"], ["NYKAA.NS", "Nykaa"],
    ["POLICYBZR.NS", "PB Fintech"], ["DMART.NS", "Avenue Supermarts"], ["HAVELLS.NS", "Havells India"],
    ["VOLTAS.NS", "Voltas"], ["COLPAL.NS", "Colgate-Palmolive India"], ["MARICO.NS", "Marico"],
    ["GODREJCP.NS", "Godrej Consumer"], ["TATACONSUM.NS", "Tata Consumer"], ["BERGEPAINT.NS", "Berger Paints"],
  ].map(([symbol, name]) => ({ symbol, name })),
  india_broad: [
    ["^NSEI", "Nifty 50"], ["^BSESN", "Sensex"], ["^NSEBANK", "Nifty Bank"],
    ["^CNXIT", "Nifty IT"], ["^CNXAUTO", "Nifty Auto"], ["^CNXPHARMA", "Nifty Pharma"],
    ["^CNXFMCG", "Nifty FMCG"], ["^CNXMETAL", "Nifty Metal"], ["^CNXENERGY", "Nifty Energy"],
    ["^CNXREALTY", "Nifty Realty"], ["^CNXMEDIA", "Nifty Media"], ["^CNXPSUBANK", "Nifty PSU Bank"],
    ["^NSEMDCP50", "Nifty Midcap 50"], ["^CNXINFRA", "Nifty Infra"], ["^CNX100", "Nifty 100"],
  ].map(([symbol, name]) => ({ symbol, name })),
  commodities: [
    ["GC=F", "Gold"], ["SI=F", "Silver"], ["PL=F", "Platinum"], ["PA=F", "Palladium"],
    ["HG=F", "Copper"], ["CL=F", "Crude Oil (WTI)"], ["BZ=F", "Brent Crude"], ["NG=F", "Natural Gas"],
    ["ZC=F", "Corn"], ["ZW=F", "Wheat"], ["ZS=F", "Soybeans"], ["ZM=F", "Soybean Meal"],
    ["ZL=F", "Soybean Oil"], ["KC=F", "Coffee"], ["CT=F", "Cotton"], ["CC=F", "Cocoa"],
    ["SB=F", "Sugar"], ["LE=F", "Live Cattle"], ["HE=F", "Lean Hogs"], ["LBS=F", "Lumber"],
  ].map(([symbol, name]) => ({ symbol, name })),
  forex: [
    ["EURUSD=X", "EUR/USD"], ["GBPUSD=X", "GBP/USD"], ["USDJPY=X", "USD/JPY"], ["USDINR=X", "USD/INR"],
    ["AUDUSD=X", "AUD/USD"], ["USDCAD=X", "USD/CAD"], ["USDCHF=X", "USD/CHF"], ["NZDUSD=X", "NZD/USD"],
    ["EURGBP=X", "EUR/GBP"], ["EURJPY=X", "EUR/JPY"], ["GBPJPY=X", "GBP/JPY"], ["EURINR=X", "EUR/INR"],
    ["GBPINR=X", "GBP/INR"], ["USDCNY=X", "USD/CNY"], ["USDSGD=X", "USD/SGD"], ["USDHKD=X", "USD/HKD"],
    ["USDZAR=X", "USD/ZAR"], ["USDMXN=X", "USD/MXN"], ["USDBRL=X", "USD/BRL"], ["USDTRY=X", "USD/TRY"],
  ].map(([symbol, name]) => ({ symbol, name })),
};

async function fetchOne(
  symbol: string,
  name: string,
): Promise<MarketHeatmapEntry | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const response = await fetch(url, {
      next: { revalidate: 60 },
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 (compatible; AetherHeatmap/1.0)",
      },
    });
    if (!response.ok) return null;

    const data: unknown = await response.json();
    const meta = (data as Record<string, unknown>)?.chart as Record<string, unknown> | undefined;
    const result = (meta?.result as unknown[] | undefined)?.[0] as Record<string, unknown> | undefined;
    const m = result?.meta as Record<string, unknown> | undefined;
    if (!m) return null;

    const price = typeof m.regularMarketPrice === "number" ? m.regularMarketPrice : null;
    const prevClose =
      typeof m.chartPreviousClose === "number"
        ? m.chartPreviousClose
        : typeof m.previousClose === "number"
          ? m.previousClose
          : null;
    const volume = typeof m.regularMarketVolume === "number" ? m.regularMarketVolume : 0;
    if (price === null) return null;

    const changePct = prevClose && prevClose !== 0 ? ((price - prevClose) / prevClose) * 100 : null;
    // Indices report zero volume via this endpoint — size by price alone so the box still renders.
    const value = volume > 0 ? price * volume : price;

    return { symbol: symbol.replace(/\.NS$|=F$|=X$|^\^/, ""), name, price, value, changePct };
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Yahoo's unofficial per-symbol chart endpoint — no key, no auth, matches
 * what the reference site's network tab shows. Never throws: a down/blocked
 * feed degrades to "unavailable", same contract as lib/heatmap/coingecko.ts.
 */
export async function getYahooHeatmap(category: YahooHeatmapCategory): Promise<MarketHeatmapResult> {
  const universe = SYMBOLS[category];
  try {
    const results = await mapWithConcurrency(universe, 8, ({ symbol, name }) => fetchOne(symbol, name));
    const entries = results.filter((e): e is MarketHeatmapEntry => e !== null);

    if (entries.length === 0) {
      return { status: "unavailable", reason: "Yahoo returned no usable quotes" };
    }
    return { status: "ok", entries };
  } catch (error) {
    return {
      status: "unavailable",
      reason: error instanceof Error ? error.message : "network error",
    };
  }
}
