// The strategy permission ladder, split out of permissions.ts so client
// components can rank a level without pulling in that module's
// `server-only` + db imports.

// Ladder, low to high — matches the Share modal's five options ("No access"
// is the absence of both a workspace-level grant and a strategy_access row,
// so it isn't a ladder rung, just the fallback).
export type StrategyPermissionLevel = "none" | "view" | "view_execute" | "edit_execute" | "co_owner";

const LEVEL_RANK: Record<StrategyPermissionLevel, number> = {
  none: 0,
  view: 1,
  view_execute: 2,
  edit_execute: 3,
  co_owner: 4,
};

export function meetsLevel(have: StrategyPermissionLevel, need: StrategyPermissionLevel): boolean {
  return LEVEL_RANK[have] >= LEVEL_RANK[need];
}

export function higherLevel(a: StrategyPermissionLevel, b: StrategyPermissionLevel): StrategyPermissionLevel {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}
