// Pure reconciliation rules for the broker position sync. Kept free of any
// database or SDK import so the decision itself can be tested directly —
// this is the logic that decides a real position is closed, and it should
// not need a live Postgres connection to exercise.

/** Grace period before a local row is eligible for reconciliation, so a
 * position the app opened seconds ago isn't closed just because the
 * broker's position feed hasn't caught up yet. */
export const RECONCILE_GRACE_MS = 5 * 60 * 1000;

export type ReconcilableRow = {
  id: string;
  externalPositionId: string | null;
  isPaper: boolean;
  openedAt: Date;
};

/**
 * Which local rows a complete broker feed proves are no longer open.
 * Split out from the database work so the rule itself is testable — every
 * exclusion here is a case where closing the row would be wrong:
 *
 * - paper positions never exist at a broker at all;
 * - a row with no external id can't be matched against the feed, so its
 *   absence proves nothing;
 * - a row opened within the grace window may simply not have propagated.
 */
export function stalePositionIds(
  localOpen: ReconcilableRow[],
  liveExternalIds: string[],
  now: Date,
  graceMs: number = RECONCILE_GRACE_MS,
): string[] {
  const live = new Set(liveExternalIds);
  const cutoff = now.getTime() - graceMs;

  return localOpen
    .filter((row) => !row.isPaper)
    .filter((row) => row.externalPositionId !== null)
    .filter((row) => row.openedAt.getTime() <= cutoff)
    .filter((row) => !live.has(row.externalPositionId!))
    .map((row) => row.id);
}
