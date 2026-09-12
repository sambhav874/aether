import { NextResponse, type NextRequest } from "next/server";
import { getApiSession } from "@/lib/auth/api-session";
import { decodeSeriesId } from "@/lib/ai/tools/candles";
import { fetchDailyCandles } from "@/lib/ai/tools/candle-source";
import { rangeToDays } from "@/lib/ai/tools/shared";

/**
 * The client half of render_chart's candle path — ToolChart fetches this
 * with the seriesId a get_candles tool result carried, to draw the full
 * (non-downsampled) OHLC series the model itself never sees. seriesId
 * decodes back to the exact get_candles params (see candles.ts), so this
 * just replays that call with downsample:false instead of needing a cache.
 */
export async function GET(request: NextRequest) {
  if (!(await getApiSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const seriesId = request.nextUrl.searchParams.get("seriesId");
  if (!seriesId) {
    return NextResponse.json({ error: "seriesId is required" }, { status: 400 });
  }

  const params = decodeSeriesId(seriesId);
  if (!params) {
    return NextResponse.json({ error: "invalid seriesId" }, { status: 400 });
  }

  const days = rangeToDays(params.range);
  const result = await fetchDailyCandles(params.symbol, params.kind, params.market, days);

  if (result.status === "unavailable") {
    return NextResponse.json({ error: result.reason }, { status: 502 });
  }

  return NextResponse.json({ candles: result.candles, range: params.range, asOf: new Date().toISOString() });
}
