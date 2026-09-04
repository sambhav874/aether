import { pgEnum } from "drizzle-orm/pg-core";

// Shared by positions.ts and strategies.ts — kept in its own leaf module so
// neither of those two schema files needs to import the other just to reuse
// an enum (they do have a real dependency the other way, via the
// positions.strategy_id FK — a two-file cycle there would crash at module
// load with "Cannot access '...' before initialization").
export const marketEnum = pgEnum("market", ["forex", "indian_options", "indian_equity"]);
export type Market = (typeof marketEnum.enumValues)[number];

export const positionSideEnum = pgEnum("position_side", ["long", "short"]);

// Moved here from positions.ts so strategies.ts's strategy_risk_settings can
// reuse them without creating a strategies<->positions import cycle (same
// reasoning as marketEnum/positionSideEnum above).
export const stopLossTypeEnum = pgEnum("stop_loss_type", ["PERCENTAGE", "PIPS", "PRICE"]);
export const positionSizingMethodEnum = pgEnum("position_sizing_method", [
  "FIXED_PERCENTAGE",
  "FIXED_QUANTITY",
  "FIXED_RISK_AMOUNT",
]);
