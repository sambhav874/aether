import "server-only";
import { and, eq, desc, gte } from "drizzle-orm";
import { db } from "@/db/client";
import {
  strategyAccounts,
  positions,
  brokerAccounts,
  baskets,
  basketPositions,
  pendingLimitOrders,
  positionExecutions,
  strategyRiskSettings,
  tradingSettings,
} from "@/db/schema";
import { getRunner } from "@/lib/runners";
import type { Market } from "@/db/schema";
import type { SignalAction } from "@/lib/webhooks/parse-signal-message";
import { gateAction, type ActionGate, type StrategyActionFlags } from "@/lib/strategies/action-gates";
import { checkTradingHalt, haltMessage } from "@/lib/strategies/halt";
import { claimAccountsForSignal, releaseUnsettledClaims, settleDispatches } from "@/lib/strategies/idempotency";
import { fanOutToAccounts } from "@/lib/strategies/fan-out";

export type DispatchableSignal = {
  /** The signals row already inserted for this attempt — see route.ts's
   * insert-then-update flow. Lets a queued limit order (pendingLimitOrders)
   * update the same signal row later once it actually fills or expires,
   * instead of leaving a stale "awaiting fill" message forever. */
  signalId: string;
  action: SignalAction;
  symbol: string;
  tag: string | null;
  quantity: string | null;
  risk: string | null;
  /** MODIFY only — which side's positions to target, default already applied by the caller */
  side: "long" | "short" | null;
  sl: string | null;
  target: string | null;
  valueType: "PRICE" | "POINTS" | "PERCENTAGE" | null;
  /** CLOSELONGPARTIAL/CLOSESHORTPARTIAL only — percent of open quantity to book */
  percent: string | null;
  /** Entry limit price — indian_options BUY/SELL only, honored on Motilal only */
  price: string | null;
  comment: string | null;
  basketId: string | null;
  basketName: string | null;
  /** Per-signal override of the strategy's paperTrading flag ("true"/"false" as sent). */
  paper: string | null;
};

export type DispatchOutcome = {
  status: "received" | "rejected";
  resultMessage: string;
  /** Present when the path fanned out through fanOutToAccounts — lets
   * dispatchSignal settle each claim with its own result rather than one
   * status for the whole signal. */
  outcomes?: { accountId: string; executed: boolean; message: string }[];
};

type LinkedAccount = {
  accountId: string;
  provider: (typeof brokerAccounts.$inferSelect)["provider"];
  multiplier: number;
};
type StrategyRef = StrategyActionFlags & {
  id: string;
  workspaceId: string;
  market: Market;
  handleType: "AUTO" | "MANUAL" | "BY_STRATEGY";
  createdBy: string;
  paperTrading: boolean;
};

/**
 * Fans a signal out to every broker account linked to its strategy. Position
 * sizing is never invented here — a BUY/SELL signal must carry its own
 * quantity, since a safe generic formula would need per-instrument
 * pip/contract data this app doesn't have.
 */
export async function dispatchSignal(
  strategy: StrategyRef,
  signal: DispatchableSignal,
): Promise<DispatchOutcome> {
  // Cheapest, most specific rejection first — a disabled action never
  // reaches the broker lookup.
  const gate = gateAction(signal.action, strategy);
  if (gate.kind === "block") {
    return { status: "rejected", resultMessage: gate.reason };
  }

  // Emergency stop outranks everything below, including the strategy's own
  // settings — the point of a kill switch is that it needs no cooperation
  // from the thing being stopped.
  const halt = await checkTradingHalt(strategy.workspaceId);
  if (halt.halted) {
    return { status: "rejected", resultMessage: haltMessage(halt) };
  }

  let linkedAccounts = await db
    .select({
      accountId: brokerAccounts.id,
      provider: brokerAccounts.provider,
      multiplier: strategyAccounts.multiplier,
    })
    .from(strategyAccounts)
    .innerJoin(brokerAccounts, eq(strategyAccounts.accountId, brokerAccounts.id))
    .where(
      and(
        eq(strategyAccounts.strategyId, strategy.id),
        eq(brokerAccounts.status, "connected"),
        eq(strategyAccounts.enabled, true),
      ),
    )
    .then((rows) => rows.map((r) => ({ ...r, multiplier: Number(r.multiplier) })));

  if (linkedAccounts.length === 0) {
    return { status: "rejected", resultMessage: "no connected accounts linked to this strategy" };
  }

  // Claim each (signal, account) pair before anything reaches a broker. A
  // replayed webhook — TradingView sends them, and retries will cause more —
  // loses the claim and drops out here instead of placing a second live order
  // on an account that already filled. Claiming centrally means all five
  // dispatch paths below inherit it.
  const claimedAccounts = await claimAccountsForSignal(signal.signalId, linkedAccounts);
  if (claimedAccounts.length === 0) {
    return { status: "rejected", resultMessage: "duplicate signal — already dispatched to every linked account" };
  }
  const skipped = linkedAccounts.length - claimedAccounts.length;
  if (skipped > 0) {
    console.warn("[dispatch] signal %s: %d/%d accounts already dispatched, skipping", signal.signalId, skipped, linkedAccounts.length);
  }
  linkedAccounts = claimedAccounts;

  try {
    const outcome = await runDispatch(strategy, signal, linkedAccounts, gate);
    await settleDispatches(
      signal.signalId,
      outcome.outcomes ??
        // Paths that have not moved onto fanOutToAccounts yet report one
        // status for the whole signal; record that rather than leaving the
        // claims dangling in `claimed` forever.
        linkedAccounts.map((account) => ({
          accountId: account.accountId,
          executed: outcome.status === "received",
          message: outcome.resultMessage,
        })),
    );
    return outcome;
  } catch (error) {
    // Claimed but never dispatched. Releasing lets a retry reach these
    // accounts — without it the claim row survives, every retry skips them,
    // and the order is simply never placed.
    await releaseUnsettledClaims(
      signal.signalId,
      linkedAccounts.map((account) => account.accountId),
    );
    throw error;
  }
}

async function runDispatch(
  strategy: StrategyRef,
  signal: DispatchableSignal,
  linkedAccounts: LinkedAccount[],
  gate: ActionGate,
): Promise<DispatchOutcome> {
  switch (signal.action) {
    case "BUY":
    case "SELL":
      return dispatchEntry(strategy, signal, linkedAccounts);
    case "CLOSELONG":
      return dispatchClose(strategy, signal, linkedAccounts, "long");
    case "CLOSESHORT":
      return dispatchClose(strategy, signal, linkedAccounts, "short");
    case "CLOSELONGPARTIAL":
      return dispatchPartialClose(strategy, signal, linkedAccounts, "long");
    case "CLOSESHORTPARTIAL":
      return dispatchPartialClose(strategy, signal, linkedAccounts, "short");
    case "MODIFY":
      return dispatchModify(strategy, signal, linkedAccounts);
    case "CLOSESHORTBUY":
      return dispatchCompound(strategy, signal, linkedAccounts, "short", "long", gate);
    case "CLOSELONGSELL":
      return dispatchCompound(strategy, signal, linkedAccounts, "long", "short", gate);
    case "CLOSESHORTSELL":
      return dispatchCompound(strategy, signal, linkedAccounts, "short", "short", gate);
    case "CLOSELONGBUY":
      return dispatchCompound(strategy, signal, linkedAccounts, "long", "long", gate);
  }
}

/** Simple, deterministic distance-from-entry stop — never a fabrication, just
 * price * risk%. Anything more precise (capital-based sizing, pip value)
 * would need data this app doesn't have. */
export function riskBasedStop(entryPrice: number, side: "long" | "short", riskPercent: number): number {
  const distance = entryPrice * (riskPercent / 100);
  return side === "long" ? entryPrice - distance : entryPrice + distance;
}

// BUY must never pay above the requested price, SELL must never accept below
// it — so a BUY limit rounds down to the ₹0.05 grid and a SELL limit rounds
// up, per the documented options entry-limit-price spec.
//
// Counted in integer paise rather than dividing by 0.05 directly. In floating
// point `0.15 / 0.05` is 2.9999999999999996, so Math.floor took an already
// valid tick price a full tick below what the strategy asked for — 0.15
// became 0.10, 2.30 became 2.25 — and the resulting BUY limit sat under the
// market and never filled. Exact tick prices are the common case here, since
// brokers quote on the grid.
export function roundOptionTick(price: number, side: "long" | "short"): number {
  const TICK_PAISE = 5;
  const paise = Math.round(price * 100);
  const steps = paise / TICK_PAISE;
  const rounded = side === "long" ? Math.floor(steps) : Math.ceil(steps);
  return (rounded * TICK_PAISE) / 100;
}

export async function linkToBasket(
  workspaceId: string,
  createdBy: string,
  positionId: string,
  basketId: string | null,
  basketName: string | null,
): Promise<void> {
  let targetBasketId = basketId;

  if (targetBasketId) {
    const [existing] = await db
      .select({ id: baskets.id })
      .from(baskets)
      .where(and(eq(baskets.id, targetBasketId), eq(baskets.workspaceId, workspaceId)));
    // Invalid/foreign basketId — skip the basket link rather than failing an
    // otherwise-successful entry over metadata.
    if (!existing) targetBasketId = null;
  } else if (basketName) {
    const [existing] = await db
      .select({ id: baskets.id })
      .from(baskets)
      .where(and(eq(baskets.workspaceId, workspaceId), eq(baskets.name, basketName)));
    if (existing) {
      targetBasketId = existing.id;
    } else {
      const [created] = await db
        .insert(baskets)
        .values({ id: crypto.randomUUID(), workspaceId, name: basketName, createdBy })
        .returning({ id: baskets.id });
      targetBasketId = created.id;
    }
  }

  if (!targetBasketId) return;
  await db.insert(basketPositions).values({ basketId: targetBasketId, positionId }).onConflictDoNothing();
}

type ResolvedRiskLimits = {
  maxConcurrentPositions: number | null;
  maxPositionsPerSymbol: number | null;
  dailyTradeLimit: number | null;
  allowMultipleSameSide: boolean;
};

/** Strategy-level override first, workspace/market default second — same
 * two-layer resolution the Risk & exits modal shows the user ("inherited"
 * placeholders). Absent at both layers means "no limit". */
async function resolveRiskLimits(strategy: StrategyRef): Promise<ResolvedRiskLimits> {
  const [strategyRow] = await db
    .select()
    .from(strategyRiskSettings)
    .where(eq(strategyRiskSettings.strategyId, strategy.id))
    .limit(1);

  const [workspaceRow] = await db
    .select()
    .from(tradingSettings)
    .where(and(eq(tradingSettings.workspaceId, strategy.workspaceId), eq(tradingSettings.market, strategy.market)))
    .limit(1);

  const num = (v: string | number | null | undefined) => (v === null || v === undefined ? null : Number(v));

  return {
    maxConcurrentPositions: num(strategyRow?.maxConcurrentPositions) ?? num(workspaceRow?.maxConcurrentPositions),
    maxPositionsPerSymbol: num(strategyRow?.maxPositionsPerSymbol) ?? num(workspaceRow?.maxPositionsPerSymbol),
    dailyTradeLimit: num(strategyRow?.dailyTradeLimit) ?? num(workspaceRow?.dailyTradeLimit),
    // No workspace-level equivalent exists (trading_settings predates this
    // toggle) — strategy-level only, defaults closed (today's real-world
    // default: one BUY and one SELL max per symbol).
    allowMultipleSameSide: strategyRow?.allowMultipleSameSide ?? false,
  };
}

/** Pre-flight checks that run BEFORE any broker call — the whole point is to
 * reject before an order can be placed, not after. Scoped per-strategy
 * (across all its linked accounts), matching how the Risk & exits modal
 * describes these limits. */
async function enforceRiskLimits(
  strategy: StrategyRef,
  symbol: string,
  side: "long" | "short",
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const limits = await resolveRiskLimits(strategy);
  if (
    limits.maxConcurrentPositions === null &&
    limits.maxPositionsPerSymbol === null &&
    limits.dailyTradeLimit === null &&
    limits.allowMultipleSameSide
  ) {
    return { ok: true };
  }

  const openForStrategy = await db
    .select({ symbol: positions.symbol, side: positions.side })
    .from(positions)
    .where(and(eq(positions.strategyId, strategy.id), eq(positions.status, "open")));

  if (limits.maxConcurrentPositions !== null && openForStrategy.length >= limits.maxConcurrentPositions) {
    return {
      ok: false,
      reason: `max concurrent positions reached (${openForStrategy.length}/${limits.maxConcurrentPositions})`,
    };
  }

  const openOnSymbol = openForStrategy.filter((p) => p.symbol === symbol);
  if (limits.maxPositionsPerSymbol !== null && openOnSymbol.length >= limits.maxPositionsPerSymbol) {
    return {
      ok: false,
      reason: `max positions per symbol reached for ${symbol} (${openOnSymbol.length}/${limits.maxPositionsPerSymbol})`,
    };
  }

  if (!limits.allowMultipleSameSide && openOnSymbol.some((p) => p.side === side)) {
    return {
      ok: false,
      reason: `a ${side} position on ${symbol} is already open and "allow multiple trades on same side" is off`,
    };
  }

  if (limits.dailyTradeLimit !== null) {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayCount = await db
      .select({ id: positions.id })
      .from(positions)
      .where(and(eq(positions.strategyId, strategy.id), gte(positions.openedAt, todayStart)));
    if (todayCount.length >= limits.dailyTradeLimit) {
      return { ok: false, reason: `daily trade limit reached (${todayCount.length}/${limits.dailyTradeLimit})` };
    }
  }

  return { ok: true };
}

async function dispatchEntry(
  strategy: StrategyRef,
  signal: DispatchableSignal,
  linkedAccounts: LinkedAccount[],
  sideOverride?: "long" | "short",
): Promise<DispatchOutcome> {
  if (!signal.quantity) {
    return {
      status: "rejected",
      resultMessage:
        "signal is missing quantity — automatic position sizing isn't implemented, include it in the webhook message",
    };
  }

  const side: "long" | "short" = sideOverride ?? (signal.action === "BUY" ? "long" : "short");
  const orderSide = side === "long" ? "buy" : "sell";
  const baseQuantity = Number(signal.quantity);
  const riskPercent = signal.risk ? Number(signal.risk) : 1;
  const limitPrice = signal.price ? Number(signal.price) : null;
  const isPaper = signal.paper !== null ? signal.paper.toLowerCase() === "true" : strategy.paperTrading;

  const riskCheck = await enforceRiskLimits(strategy, signal.symbol, side);
  if (!riskCheck.ok) {
    return { status: "rejected", resultMessage: riskCheck.reason };
  }

  if (isPaper) {
    return dispatchPaperEntry(strategy, signal, linkedAccounts, side, baseQuantity, riskPercent, limitPrice);
  }

  // One shared, tested loop instead of a hand-rolled one per dispatch path.
  // A throw is contained to the account that threw, message order stays the
  // input order whatever the scheduling, and concurrency is one knob.
  return fanOutToAccounts(linkedAccounts, async (account: LinkedAccount) => {
    const quantity = baseQuantity * account.multiplier;
      if (limitPrice !== null) {
        // Only Motilal can cancel a resting unfilled order today — see
        // app/api/cron/poll-limit-orders/route.ts. Every other adapter gets a
        // clean per-account rejection instead of silently falling back to a
        // market order, which would ignore the caller's price entirely.
        if (account.provider !== "motilal") {
          return {
            executed: false,
            message: `${account.accountId}: rejected — price= entries are only honored on Motilal (this adapter can't cancel a resting order yet)`,
          };
        }

        const roundedPrice = roundOptionTick(limitPrice, side);
        const runner = await getRunner(account.provider);
        const result = await runner.placeOrder(account.accountId, {
          symbol: signal.symbol,
          side: orderSide,
          quantity,
          price: roundedPrice,
        });

        if (result.status !== "executed") {
          return { executed: false, message: `${account.accountId}: rejected — ${result.message}` };
        }

        // No position yet — it's a resting order. The poll job creates the
        // position once it actually fills (or cancels it after ~60s).
        await db.insert(pendingLimitOrders).values({
          id: crypto.randomUUID(),
          workspaceId: strategy.workspaceId,
          strategyId: strategy.id,
          signalId: signal.signalId,
          accountId: account.accountId,
          market: strategy.market,
          symbol: signal.symbol,
          side,
          quantity: quantity.toString(),
          limitPrice: roundedPrice.toString(),
          externalOrderId: result.externalOrderId,
          tag: signal.tag,
          riskPercent: riskPercent.toString(),
          comment: signal.comment,
          basketId: signal.basketId,
          basketName: signal.basketName,
          deadlineAt: new Date(Date.now() + 60_000),
        });
        return {
          executed: true,
          message: `${account.accountId}: limit order queued at ${roundedPrice} (orderId=${result.externalOrderId}), awaiting fill up to 60s`,
        };
      }

      const entryRunner = await getRunner(account.provider);
      const result = await entryRunner.placeOrder(account.accountId, {
        symbol: signal.symbol,
        side: orderSide,
        quantity,
      });

      if (result.status !== "executed") {
        return { executed: false, message: `${account.accountId}: rejected — ${result.message}` };
      }

      // The broker's own record of the fill is the only trustworthy source
      // for entry price — never a client-supplied number. If we can't find
      // it we still count the order as executed (it really was, at the
      // broker) but don't record a position with a guessed price.
      const brokerPositions = await entryRunner.getPositions(account.accountId);
      const fill = brokerPositions.find((p) => p.externalPositionId === result.externalOrderId);

      if (!fill) {
        return {
          executed: true,
          message: `${account.accountId}: executed (orderId=${result.externalOrderId}) but fill could not be confirmed — not recorded, reconcile manually`,
        };
      }

      const sl = strategy.handleType === "BY_STRATEGY" ? null : riskBasedStop(fill.entryPrice, side, riskPercent);

      const [insertedPosition] = await db
        .insert(positions)
        .values({
          id: crypto.randomUUID(),
          workspaceId: strategy.workspaceId,
          accountId: account.accountId,
          market: strategy.market,
          symbol: signal.symbol,
          side,
          entryPrice: fill.entryPrice.toString(),
          quantity: quantity.toString(),
          status: "open",
          sl: sl?.toString() ?? null,
          tag: signal.tag,
          comment: signal.comment,
          strategyId: strategy.id,
          externalPositionId: fill.externalPositionId,
          openedAt: fill.openedAt,
        })
        .returning({ id: positions.id });

      // Real broker fill data (already fetched above via getPositions to
      // resolve entryPrice) — the only execution leg we can record honestly
      // at dispatch time. The close leg's fill price isn't tracked anywhere
      // yet (no position-reconciliation sync exists — same reason
      // exitPrice/pnl are left null on close, see dispatchClose below), so
      // it isn't fabricated here either.
      await db.insert(positionExecutions).values({
        id: crypto.randomUUID(),
        positionId: insertedPosition.id,
        externalOrderId: result.externalOrderId,
        occurredAt: fill.openedAt,
        type: side === "long" ? "bought" : "sold",
        side,
        quantity: quantity.toString(),
        price: fill.entryPrice.toString(),
        source: strategy.id,
      });

      if (signal.basketId || signal.basketName) {
        await linkToBasket(strategy.workspaceId, strategy.createdBy, insertedPosition.id, signal.basketId, signal.basketName);
      }

      return { executed: true, message: `${account.accountId}: executed` };
  });
}

/**
 * Paper-trading fill path — never calls the broker. Per the webhook guide's
 * documented rule, the entry fills at the signal's own `price=` when no live
 * tick is available. This codebase has no general live-quote source outside
 * the Dhan option chain module, so `price=` is required for a paper entry
 * for now — rejecting cleanly rather than fabricating a fill price, same
 * rule as every other price this engine ever records.
 */
async function dispatchPaperEntry(
  strategy: StrategyRef,
  signal: DispatchableSignal,
  linkedAccounts: LinkedAccount[],
  side: "long" | "short",
  baseQuantity: number,
  riskPercent: number,
  limitPrice: number | null,
): Promise<DispatchOutcome> {
  if (limitPrice === null) {
    return {
      status: "rejected",
      resultMessage: "paper trading requires price= — no live quote source is available to fill a simulated entry",
    };
  }

  const entryPrice = limitPrice;
  const sl = strategy.handleType === "BY_STRATEGY" ? null : riskBasedStop(entryPrice, side, riskPercent);
  const openedAt = new Date();

  let executed = 0;
  const messages: string[] = [];

  for (const account of linkedAccounts) {
    const quantity = baseQuantity * account.multiplier;
    try {
      const [insertedPosition] = await db
        .insert(positions)
        .values({
          id: crypto.randomUUID(),
          workspaceId: strategy.workspaceId,
          accountId: account.accountId,
          market: strategy.market,
          symbol: signal.symbol,
          side,
          entryPrice: entryPrice.toString(),
          quantity: quantity.toString(),
          status: "open",
          sl: sl?.toString() ?? null,
          tag: signal.tag,
          comment: signal.comment,
          strategyId: strategy.id,
          externalPositionId: null,
          isPaper: true,
          openedAt,
        })
        .returning({ id: positions.id });

      await db.insert(positionExecutions).values({
        id: crypto.randomUUID(),
        positionId: insertedPosition.id,
        externalOrderId: null,
        occurredAt: openedAt,
        type: side === "long" ? "bought" : "sold",
        side,
        quantity: quantity.toString(),
        price: entryPrice.toString(),
        source: "paper",
      });

      if (signal.basketId || signal.basketName) {
        await linkToBasket(strategy.workspaceId, strategy.createdBy, insertedPosition.id, signal.basketId, signal.basketName);
      }

      executed += 1;
      messages.push(`${account.accountId}: paper fill at ${entryPrice}`);
    } catch (error) {
      messages.push(`${account.accountId}: error — ${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  return {
    status: executed > 0 ? "received" : "rejected",
    resultMessage: `paper-filled ${executed}/${linkedAccounts.length} accounts: ${messages.join("; ")}`,
  };
}

async function findMatchingOpenPositions(
  strategyId: string,
  accountId: string,
  symbol: string,
  side: "long" | "short",
  tag: string | null,
) {
  const conditions = [
    eq(positions.strategyId, strategyId),
    eq(positions.accountId, accountId),
    eq(positions.symbol, symbol),
    eq(positions.side, side),
    eq(positions.status, "open"),
  ];
  if (tag !== null) conditions.push(eq(positions.tag, tag));

  return db
    .select()
    .from(positions)
    .where(and(...conditions))
    .orderBy(desc(positions.openedAt));
}

async function dispatchClose(
  strategy: StrategyRef,
  signal: DispatchableSignal,
  linkedAccounts: LinkedAccount[],
  targetSide: "long" | "short",
): Promise<DispatchOutcome> {
  let closed = 0;
  let attempted = 0;
  const messages: string[] = [];

  for (const account of linkedAccounts) {
    const openPositions = await findMatchingOpenPositions(
      strategy.id,
      account.accountId,
      signal.symbol,
      targetSide,
      signal.tag,
    );

    if (openPositions.length === 0) {
      messages.push(`${account.accountId}: no open ${targetSide} position`);
      continue;
    }

    const runner = await getRunner(account.provider);
    for (const position of openPositions) {
      attempted += 1;
      if (!position.externalPositionId) {
        messages.push(`${account.accountId}: position ${position.id} has no broker order id on record`);
        continue;
      }
      try {
        const result = await runner.closePosition(account.accountId, position.externalPositionId);
        if (result.status === "executed") {
          // Same limitation as the manual bulk-close action (lib/positions/actions.ts):
          // closePosition's ExecutionResult carries no fill price, so exitPrice/pnl
          // are left for the next broker sync to reconcile rather than guessed here.
          await db
            .update(positions)
            .set({ status: "closed", closeReason: "signal_close", closedAt: new Date(), updatedAt: new Date() })
            .where(eq(positions.id, position.id));
          closed += 1;
          messages.push(`${account.accountId}: closed ${position.id}`);
        } else {
          messages.push(`${account.accountId}: rejected — ${result.message}`);
        }
      } catch (error) {
        messages.push(`${account.accountId}: error — ${error instanceof Error ? error.message : "unknown"}`);
      }
    }
  }

  if (attempted === 0) {
    return { status: "rejected", resultMessage: `no open ${targetSide} positions to close: ${messages.join("; ")}` };
  }
  return {
    status: closed > 0 ? "received" : "rejected",
    resultMessage: `closed ${closed}/${attempted} matching positions: ${messages.join("; ")}`,
  };
}

async function dispatchPartialClose(
  strategy: StrategyRef,
  signal: DispatchableSignal,
  linkedAccounts: LinkedAccount[],
  targetSide: "long" | "short",
): Promise<DispatchOutcome> {
  const percent = signal.percent ? Number(signal.percent) : null;
  // quantity= (absolute lots) wins over percent= if both are sent, per spec.
  const absoluteQty = signal.quantity ? Number(signal.quantity) : null;

  let closed = 0;
  let attempted = 0;
  const messages: string[] = [];

  for (const account of linkedAccounts) {
    const openPositions = await findMatchingOpenPositions(
      strategy.id,
      account.accountId,
      signal.symbol,
      targetSide,
      signal.tag,
    );

    if (openPositions.length === 0) {
      messages.push(`${account.accountId}: no open ${targetSide} position`);
      continue;
    }

    const runner = await getRunner(account.provider);
    for (const position of openPositions) {
      attempted += 1;
      if (!position.externalPositionId) {
        messages.push(`${account.accountId}: position ${position.id} has no broker order id on record`);
        continue;
      }

      const openQty = Number(position.quantity);
      const rawCloseQty = absoluteQty !== null ? absoluteQty : openQty * ((percent ?? 0) / 100);
      // An oversized value just closes the position fully, per spec.
      const closeQty = Math.min(rawCloseQty, openQty);

      try {
        const result = await runner.closePosition(account.accountId, position.externalPositionId, closeQty);
        if (result.status !== "executed") {
          messages.push(`${account.accountId}: rejected — ${result.message}`);
          continue;
        }

        const remaining = openQty - closeQty;
        if (remaining <= 1e-8) {
          await db
            .update(positions)
            .set({ status: "closed", closeReason: "signal_partial_close", closedAt: new Date(), updatedAt: new Date() })
            .where(eq(positions.id, position.id));
        } else {
          await db
            .update(positions)
            .set({ quantity: remaining.toString(), updatedAt: new Date() })
            .where(eq(positions.id, position.id));
        }
        closed += 1;
        messages.push(`${account.accountId}: booked ${closeQty} of ${openQty} on ${position.id}`);
      } catch (error) {
        messages.push(`${account.accountId}: error — ${error instanceof Error ? error.message : "unknown"}`);
      }
    }
  }

  if (attempted === 0) {
    return {
      status: "rejected",
      resultMessage: `no open ${targetSide} positions to partially close: ${messages.join("; ")}`,
    };
  }
  return {
    status: closed > 0 ? "received" : "rejected",
    resultMessage: `partially closed ${closed}/${attempted} matching positions: ${messages.join("; ")}`,
  };
}

async function dispatchCompound(
  strategy: StrategyRef,
  signal: DispatchableSignal,
  linkedAccounts: LinkedAccount[],
  closeSide: "long" | "short",
  openSide: "long" | "short",
  gate: ActionGate,
): Promise<DispatchOutcome> {
  // A "legs" gate means one of the Entry/Exit toggles is off — that leg is
  // skipped and reported, the other still runs. "allow" runs both.
  const runClose = gate.kind !== "legs" || gate.closeLeg;
  const runOpen = gate.kind !== "legs" || gate.openLeg;
  const skipped = gate.kind === "legs" ? gate.note : null;

  // Close phase failing to find anything to close is expected (e.g. a
  // reversal signal on a symbol with no prior position) — the open phase is
  // the half that determines whether the overall signal succeeded, unless
  // the open leg was gated off, in which case the close phase decides.
  const closeOutcome = runClose
    ? await dispatchClose(strategy, signal, linkedAccounts, closeSide)
    : { status: "rejected" as const, resultMessage: skipped ?? "skipped" };
  const entryOutcome = runOpen
    ? await dispatchEntry(strategy, signal, linkedAccounts, openSide)
    : { status: "rejected" as const, resultMessage: skipped ?? "skipped" };

  return {
    status: runOpen ? entryOutcome.status : closeOutcome.status,
    resultMessage: `close phase: ${closeOutcome.resultMessage} | open phase: ${entryOutcome.resultMessage}`,
  };
}

export function resolveAbsolutePrice(
  raw: string,
  valueType: "PRICE" | "POINTS" | "PERCENTAGE",
  entryPrice: number,
  side: "long" | "short",
  kind: "sl" | "target",
): number {
  const value = Number(raw);
  if (valueType === "PRICE") return value;

  const distance = valueType === "POINTS" ? value : entryPrice * (value / 100);
  const towardLoss = kind === "sl";
  const goesDown = (side === "long" && towardLoss) || (side === "short" && !towardLoss);
  return goesDown ? entryPrice - distance : entryPrice + distance;
}

async function dispatchModify(
  strategy: StrategyRef,
  signal: DispatchableSignal,
  linkedAccounts: LinkedAccount[],
): Promise<DispatchOutcome> {
  if (!signal.sl && !signal.target) {
    return { status: "rejected", resultMessage: "MODIFY signal is missing stopLoss and target" };
  }
  const targetSide = signal.side ?? "long";
  const valueType = signal.valueType ?? "PRICE";

  // A "point" is one price unit — a real, direct convention for options/equity
  // (1 point = ₹1 of premium/price) but not for forex, where a pip's price
  // value varies per pair (0.0001 vs 0.01 for JPY pairs, etc). Without that
  // per-symbol metadata, converting POINTS to a price for forex would be a
  // guess — reject instead of computing a wrong stop.
  if (valueType === "POINTS" && strategy.market === "forex") {
    return {
      status: "rejected",
      resultMessage: "POINTS is not supported for forex yet (pip size varies per pair) — use PRICE or PERCENTAGE",
    };
  }

  let modified = 0;
  let attempted = 0;
  const messages: string[] = [];

  for (const account of linkedAccounts) {
    const openPositions = await findMatchingOpenPositions(
      strategy.id,
      account.accountId,
      signal.symbol,
      targetSide,
      signal.tag,
    );

    if (openPositions.length === 0) {
      messages.push(`${account.accountId}: no open ${targetSide} position`);
      continue;
    }

    for (const position of openPositions) {
      attempted += 1;
      const entryPrice = Number(position.entryPrice);
      const update: { sl?: string; target?: string; updatedAt: Date } = { updatedAt: new Date() };
      if (signal.sl) {
        update.sl = resolveAbsolutePrice(signal.sl, valueType, entryPrice, targetSide, "sl").toString();
      }
      if (signal.target) {
        update.target = resolveAbsolutePrice(signal.target, valueType, entryPrice, targetSide, "target").toString();
      }
      await db.update(positions).set(update).where(eq(positions.id, position.id));
      modified += 1;
    }
    messages.push(`${account.accountId}: updated ${openPositions.length} position(s)`);
  }

  if (attempted === 0) {
    return { status: "rejected", resultMessage: `no open ${targetSide} positions to modify: ${messages.join("; ")}` };
  }
  return {
    status: "received",
    resultMessage: `updated ${modified}/${attempted} matching positions locally — not yet pushed to the broker as a live order: ${messages.join("; ")}`,
  };
}
