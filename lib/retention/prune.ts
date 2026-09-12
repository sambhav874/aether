import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { signals } from "@/db/schema/strategies";
import { auditLog } from "@/db/schema";

/**
 * How long each kind of record is kept.
 *
 * `rawPayload` is the inbound webhook body verbatim. It is the field most
 * likely to carry something a user would later ask to have deleted, and it
 * grew without bound — every signal ever received, kept forever.
 *
 * The signal row outlives its payload by a wide margin: trade history is what
 * the performance pages are built from, while the raw body is only useful
 * while someone is debugging a misfiring alert.
 */
export const RETENTION = {
  /** Raw webhook bodies — debugging material, not trade history. */
  rawPayloadDays: 30,
  /** Signals that never became a trade. Filled ones are never pruned here. */
  rejectedSignalDays: 180,
  /** Audit entries. Long, because they answer "who changed this". */
  auditLogDays: 730,
} as const;

export const PRUNED_PLACEHOLDER = "[pruned]";

export type PruneSummary = {
  payloadsCleared: number;
  signalsDeleted: number;
  auditEntriesDeleted: number;
};

export function daysAgo(days: number, now = Date.now()): Date {
  return new Date(now - days * 24 * 60 * 60 * 1000);
}

/**
 * Idempotent — safe to run as often as you like, and safe to interrupt.
 *
 * Payloads are blanked rather than their row deleted: the signal's own
 * history (what fired, when, what the broker said) stays intact, and only the
 * verbatim body goes.
 */
export async function pruneRetention(): Promise<PruneSummary> {
  const payloads = await db
    .update(signals)
    .set({ rawPayload: PRUNED_PLACEHOLDER })
    .where(
      and(
        lt(signals.receivedAt, daysAgo(RETENTION.rawPayloadDays)),
        sql`${signals.rawPayload} <> ${PRUNED_PLACEHOLDER}`,
      ),
    )
    .returning({ id: signals.id });

  // Only signals that never resulted in an order — a rejected signal past its
  // window is noise; a filled one is trade history.
  const rejected = await db
    .delete(signals)
    .where(and(eq(signals.status, "rejected"), lt(signals.receivedAt, daysAgo(RETENTION.rejectedSignalDays))))
    .returning({ id: signals.id });

  const audits = await db
    .delete(auditLog)
    .where(lt(auditLog.occurredAt, daysAgo(RETENTION.auditLogDays)))
    .returning({ id: auditLog.id });

  return {
    payloadsCleared: payloads.length,
    signalsDeleted: rejected.length,
    auditEntriesDeleted: audits.length,
  };
}
