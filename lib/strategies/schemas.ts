import { z } from "zod";

/**
 * Runtime shapes for the strategy server actions.
 *
 * Server actions are a public HTTP endpoint wearing a function signature.
 * TypeScript parameter types erase at build, so before this every action here
 * accepted whatever a caller chose to send and wrote it straight into
 * Drizzle. These are the actions that set position sizing and stop distances,
 * so "whatever a caller chose to send" reaches an order.
 *
 * Bounds are deliberately generous — the job is rejecting nonsense
 * (negatives, NaN, a percentage of 10000), not second-guessing a trader's
 * numbers.
 */

const id = z.string().min(1).max(128);

/** A nullable number that must be finite and non-negative when present. */
const optionalAmount = z.number().finite().nonnegative().nullable().optional();
const optionalCount = z.number().int().positive().max(10_000).nullable().optional();
const optionalPercent = z.number().finite().positive().max(1_000).nullable().optional();

export const strategyIdSchema = id;

export const riskSettingsSchema = z.object({
  sizingMethod: z.enum(["FIXED_PERCENTAGE", "FIXED_QUANTITY", "FIXED_RISK_AMOUNT"]).nullable().optional(),
  totalCapital: optionalAmount,
  availableCapital: optionalAmount,
  maxConcurrentPositions: optionalCount,
  maxPositionsPerSymbol: optionalCount,
  dailyTradeLimit: optionalCount,
  allowMultipleSameSide: z.boolean().optional(),
  maxRiskPct: optionalPercent,
  maxRiskPips: optionalAmount,
  stopLossType: z.enum(["PERCENTAGE", "PIPS", "PRICE"]).nullable().optional(),
  defaultStopLossPct: optionalPercent,
  riskRewardRatio: z.number().finite().positive().max(1_000).nullable().optional(),
  partialBookingR: z.number().finite().positive().max(1_000).nullable().optional(),
});

export const trailingRuleSchema = z.object({
  rrLevel: z.number().finite().positive().max(1_000),
  trailingType: z.enum(["EMA", "ATR", "LAST_4_CANDLES", "LAST_CANDLE"]),
  sortOrder: z.number().int().min(0).max(1_000),
});

export const partialRuleSchema = z.object({
  rrLevel: z.number().finite().positive().max(1_000),
  exitPct: z.number().finite().positive().max(100),
  sortOrder: z.number().int().min(0).max(1_000),
});

/** Caps the array length too — an unbounded list is its own denial of service. */
export const exitRulesSchema = z.object({
  trailingRules: z.array(trailingRuleSchema).max(50),
  partialRules: z.array(partialRuleSchema).max(50),
});

export const maxTriggersSchema = z.number().int().positive().max(100_000).nullable();

export const haltReasonSchema = z.string().trim().min(1).max(500);

export type ValidationFailure = { error: string };

/**
 * Parses input and turns a failure into the `{ error }` shape every action
 * already returns, so callers need no new branch.
 *
 * The message names the offending field rather than dumping the whole zod
 * tree — an action result is rendered to a user, not to a developer.
 */
export function parseInput<T extends z.ZodType>(
  schema: T,
  value: unknown,
): { ok: true; data: z.infer<T> } | { ok: false; error: string } {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };

  const first = result.error.issues[0];
  const path = first?.path.join(".");
  return { ok: false, error: path ? `Invalid value for "${path}": ${first.message}` : `Invalid input: ${first?.message ?? "unrecognized shape"}` };
}
