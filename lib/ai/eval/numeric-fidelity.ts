// The single most important eval metric per PLAN_AI_COPILOT.md §6 and
// invariant #2 (models.ts/§0): "every number in the answer appears in a
// tool result from that turn". This is what makes that invariant checkable
// rather than just prompted — a pure function, no LLM involved, suitable as
// a CI gate. Target: 1.00.

/** ISO dates (2026-08-13) are pulled out and ignored before number extraction — otherwise "2026", "08", "13" would each be treated as ungrounded numeric claims. */
const ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/g;

/**
 * Matches a numeric token optionally preceded by a currency symbol,
 * optionally comma-grouped (both 123,456 and Indian 1,23,456 grouping —
 * commas are simply stripped, which works for either convention), and
 * optionally followed by a scale suffix (K/L/Cr/M/B/T, case-insensitive)
 * or a trailing %.
 */
// The suffix alternation is followed by a negative lookahead so a bare
// single-letter suffix (k/l/m/b/t) can't swallow the first letter of the
// next unrelated word — without it, "2026 the stock" would read "2026" +
// suffix "t" (from "the") as trillion-scaled.
// The integer part requires each comma to be immediately followed by a
// digit (`(?:,?\d)*`, not `[\d,]*`) — otherwise a sentence-ending comma
// right after a number ("...to 2027, guidance...") gets swallowed into the
// match, which then defeats the bare-year length check below.
const NUMBER_TOKEN_RE = /[₹$]?-?\d(?:,?\d)*(?:\.\d+)?(?:\s*(k|l|lakh|lakhs|cr|crore|crores|m|mn|million|b|bn|billion|t|trillion)(?![a-zA-Z]))?%?/gi;

const SCALE_MULTIPLIERS: Record<string, number> = {
  k: 1e3,
  l: 1e5,
  lakh: 1e5,
  lakhs: 1e5,
  cr: 1e7,
  crore: 1e7,
  crores: 1e7,
  m: 1e6,
  mn: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  t: 1e12,
  trillion: 1e12,
};

// Bare 4-digit numbers in this range read as years far more often than as a
// financial figure ("the 2026 fiscal year") — excluded from the
// must-be-grounded set. A real year that also happens to be a genuine
// figure (rare) still passes if it's in evidence; this only prevents a
// false failure when it isn't.
const YEAR_MIN = 1900;
const YEAR_MAX = 2099;

export type ExtractedNumber = { raw: string; value: number };

/** Pulls every numeric claim out of free text, applying scale-suffix and comma-grouping normalization. Known limitation: doesn't special-case list/ordinal markers ("1.", "2)") — those are rare in the copilot's answer style (prose + rendered tables, not numbered lists) and would need positional context to distinguish safely. */
export function extractNumbers(text: string): ExtractedNumber[] {
  const withoutDates = text.replace(ISO_DATE_RE, " ");
  const matches = withoutDates.matchAll(NUMBER_TOKEN_RE);
  const results: ExtractedNumber[] = [];

  for (const match of matches) {
    const raw = match[0];
    const suffix = match[1]?.toLowerCase();
    const numericPart = raw
      .replace(/[₹$%]/g, "")
      .replace(/\s*(k|l|lakh|lakhs|cr|crore|crores|m|mn|million|b|bn|billion|t|trillion)$/i, "")
      .replace(/,/g, "")
      .trim();
    if (!numericPart || numericPart === "-" || numericPart === ".") continue;

    const base = Number.parseFloat(numericPart);
    if (!Number.isFinite(base)) continue;

    const isBareYear = !suffix && !raw.includes(".") && !raw.includes("%") && Number.isInteger(base) && base >= YEAR_MIN && base <= YEAR_MAX && raw.trim().length === 4;
    if (isBareYear) continue;

    const multiplier = suffix ? (SCALE_MULTIPLIERS[suffix] ?? 1) : 1;
    results.push({ raw: raw.trim(), value: base * multiplier });
  }

  return results;
}

/** Recursively collects every finite numeric leaf from a tool-result payload (or an array of them) — the ground truth a claimed number must trace back to. */
export function extractEvidenceNumbers(evidence: unknown): number[] {
  const found: number[] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 12) return; // guard against pathological/cyclic-looking structures
    if (typeof node === "number") {
      if (Number.isFinite(node)) found.push(node);
      return;
    }
    if (typeof node === "string") {
      // Numeric strings (e.g. numeric-precision DB columns serialized as
      // strings) count as evidence too — the fidelity check cares whether
      // the value is real, not what type it was stored as.
      const asNumber = Number(node);
      if (node.trim() !== "" && Number.isFinite(asNumber)) found.push(asNumber);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (node && typeof node === "object") {
      for (const value of Object.values(node)) visit(value, depth + 1);
    }
  };
  visit(evidence, 0);
  return found;
}

/** "Within rounding" per PLAN_AI_COPILOT.md §6: 1% relative, with a small absolute floor so rounding a decimal to the nearest integer (28.4 -> "28") doesn't fail purely because 1% of a small number is tiny. */
export function isWithinTolerance(claimed: number, actual: number, relativeTolerance = 0.01, absoluteFloor = 0.5): boolean {
  const tolerance = Math.max(Math.abs(actual) * relativeTolerance, absoluteFloor);
  return Math.abs(claimed - actual) <= tolerance;
}

export type FidelityUnmatched = { raw: string; value: number; nearestEvidence: number | null; diff: number | null };
export type FidelityResult = { ok: boolean; total: number; matched: number; unmatched: FidelityUnmatched[] };

/**
 * The CI-gate check itself: every number the answer states must be within
 * tolerance of some number that actually appeared in this turn's tool
 * evidence. An answer with zero numeric claims trivially passes (nothing to
 * ground) — that's a `synthesis quality` concern (§6), not a fidelity one.
 */
export function checkNumericFidelity(answerText: string, evidence: unknown): FidelityResult {
  const claimed = extractNumbers(answerText);
  const evidenceNumbers = extractEvidenceNumbers(evidence);

  const unmatched: FidelityUnmatched[] = [];
  let matched = 0;

  for (const { raw, value } of claimed) {
    const hit = evidenceNumbers.some((e) => isWithinTolerance(value, e));
    if (hit) {
      matched += 1;
      continue;
    }
    let nearest: number | null = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const e of evidenceNumbers) {
      const diff = Math.abs(value - e);
      if (diff < bestDiff) {
        bestDiff = diff;
        nearest = e;
      }
    }
    unmatched.push({ raw, value, nearestEvidence: nearest, diff: nearest === null ? null : bestDiff });
  }

  return { ok: unmatched.length === 0, total: claimed.length, matched, unmatched };
}
