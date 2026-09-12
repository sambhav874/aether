import { NextResponse, type NextRequest } from "next/server";
import { refuseUnauthorizedCron } from "@/lib/auth/cron";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { pendingLimitOrders, positions, signals, strategies } from "@/db/schema";
import { getMotilalOrderStatus, cancelMotilalOrder } from "@/lib/runners/motilal";
import { getRunner } from "@/lib/runners";
import { linkToBasket, riskBasedStop } from "@/lib/strategies/execute";

// Fills/cancels across every resting order — needs more than the platform default.
export const maxDuration = 300;

/**
 * Fills or cancels resting options entry-limit orders (price= on BUY/SELL
 * for indian_options, Motilal only — lib/strategies/execute.ts). Wire this
 * to a scheduler (Supabase pg_cron via `net.http_post`, or a Vercel Cron
 * entry in vercel.json) hitting this URL every ~15-20s with
 * `Authorization: Bearer $CRON_SECRET` — the ~60s fill window needs several
 * checks within it, not one hit at the deadline.
 */
export async function GET(request: NextRequest) {
  const unauthorized = refuseUnauthorizedCron(request);
  if (unauthorized) return unauthorized;

  const pending = await db.select().from(pendingLimitOrders).where(eq(pendingLimitOrders.status, "pending"));

  let filled = 0;
  let cancelled = 0;
  let stillPending = 0;
  const errors: string[] = [];

  for (const row of pending) {
    try {
      const orderStatus = await getMotilalOrderStatus(row.accountId, row.externalOrderId);

      if (orderStatus === "COMPLETE") {
        // The broker's own position record is the only trustworthy source
        // for entry price — same rule as the market-order path in
        // lib/strategies/execute.ts, never a client-supplied or guessed number.
        const runner = await getRunner("motilal");
        const brokerPositions = await runner.getPositions(row.accountId);
        const fill = brokerPositions.find((p) => p.externalPositionId === row.symbol && p.side === row.side);

        if (!fill) {
          // Broker says filled but we can't find the position yet (sync lag) —
          // leave it pending, try again next tick rather than guessing a price.
          stillPending += 1;
          continue;
        }

        const riskPercent = row.riskPercent ? Number(row.riskPercent) : 1;
        const sl = riskBasedStop(fill.entryPrice, row.side, riskPercent);

        const [insertedPosition] = await db
          .insert(positions)
          .values({
            id: crypto.randomUUID(),
            workspaceId: row.workspaceId,
            accountId: row.accountId,
            market: row.market,
            symbol: row.symbol,
            side: row.side,
            entryPrice: fill.entryPrice.toString(),
            quantity: row.quantity,
            status: "open",
            sl: sl.toString(),
            tag: row.tag,
            comment: row.comment,
            strategyId: row.strategyId,
            externalPositionId: fill.externalPositionId,
            openedAt: fill.openedAt,
          })
          .returning({ id: positions.id });

        if (row.basketId || row.basketName) {
          const [strategyRow] = await db
            .select({ createdBy: strategies.createdBy })
            .from(strategies)
            .where(eq(strategies.id, row.strategyId))
            .limit(1);
          if (strategyRow) {
            await linkToBasket(row.workspaceId, strategyRow.createdBy, insertedPosition.id, row.basketId, row.basketName);
          }
        }

        await db
          .update(pendingLimitOrders)
          .set({ status: "filled", resultMessage: `filled at ${fill.entryPrice}`, resolvedAt: new Date() })
          .where(eq(pendingLimitOrders.id, row.id));

        if (row.signalId) {
          await db
            .update(signals)
            .set({ status: "received", resultMessage: `limit order filled at ${fill.entryPrice}` })
            .where(eq(signals.id, row.signalId));
        }
        filled += 1;
        continue;
      }

      if (orderStatus === "REJECTED" || orderStatus === "CANCELLED") {
        await db
          .update(pendingLimitOrders)
          .set({ status: "cancelled", resultMessage: `broker reported ${orderStatus.toLowerCase()}`, resolvedAt: new Date() })
          .where(eq(pendingLimitOrders.id, row.id));
        if (row.signalId) {
          await db
            .update(signals)
            .set({ status: "rejected", resultMessage: `limit order ${orderStatus.toLowerCase()} at broker` })
            .where(eq(signals.id, row.signalId));
        }
        cancelled += 1;
        continue;
      }

      // Still resting. Past its ~60s deadline? Cancel it at the broker.
      if (row.deadlineAt <= new Date()) {
        const result = await cancelMotilalOrder(row.accountId, row.externalOrderId);

        if (!result.ok) {
          // The order may still be live at the broker — leave status
          // "pending" so the next tick retries the cancel, instead of
          // orphaning a resting order this job would otherwise stop watching.
          await db
            .update(pendingLimitOrders)
            .set({ resultMessage: `cancel attempt failed, will retry: ${result.message}` })
            .where(eq(pendingLimitOrders.id, row.id));
          errors.push(`${row.id}: cancel failed — ${result.message}`);
          continue;
        }

        await db
          .update(pendingLimitOrders)
          .set({
            status: "expired",
            resultMessage: "cancelled after 60s fill window expired",
            resolvedAt: new Date(),
          })
          .where(eq(pendingLimitOrders.id, row.id));
        if (row.signalId) {
          await db
            .update(signals)
            .set({ status: "rejected", resultMessage: "limit order not filled within 60s, cancelled" })
            .where(eq(signals.id, row.signalId));
        }
        cancelled += 1;
      } else {
        stillPending += 1;
      }
    } catch (error) {
      errors.push(`${row.id}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  return NextResponse.json({ checked: pending.length, filled, cancelled, stillPending, errors });
}
