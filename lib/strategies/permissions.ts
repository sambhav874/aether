import "server-only";
import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { strategyAccess, strategies } from "@/db/schema/strategies";
import { ROLE_OBJECTS, type WorkspaceRole } from "@/lib/auth/permissions";

import { meetsLevel, higherLevel, type StrategyPermissionLevel } from "@/lib/strategies/permission-levels";

export { meetsLevel, higherLevel };
export type { StrategyPermissionLevel };

/**
 * Coarse workspace-role → strategy-ladder mapping, derived from the same
 * `strategies`/`trading` statements lib/auth/permissions.ts already defines
 * (not a second hardcoded table, so the two can't drift). A workspace role
 * with `strategies: "manage"` (Owner/Admin/Strategist) can already create,
 * pause, and delete any strategy in the workspace today — co_owner is the
 * natural ceiling for that. `trading: "execute"` without `strategies:
 * "manage"` (Trader) can trigger/close but not edit config. Anything with
 * only `strategies: "view"` (Analyst) is view-only. No `strategies` grant at
 * all (Researcher, Integrations Viewer) falls through to "none" — those
 * roles rely entirely on an explicit strategy_access row, if any.
 */
export function workspaceRoleStrategyLevel(role: WorkspaceRole): StrategyPermissionLevel {
  const roleObject = ROLE_OBJECTS[role];
  if (roleObject.authorize({ strategies: ["manage"] }).success) return "co_owner";
  if (roleObject.authorize({ strategies: ["view"], trading: ["execute"] }).success) return "view_execute";
  if (roleObject.authorize({ strategies: ["view"] }).success) return "view";
  return "none";
}

export async function resolveStrategyPermission(
  userId: string,
  workspaceRole: WorkspaceRole,
  strategyId: string,
): Promise<StrategyPermissionLevel> {
  const base = workspaceRoleStrategyLevel(workspaceRole);
  const [row] = await db
    .select({ permission: strategyAccess.permission })
    .from(strategyAccess)
    .where(and(eq(strategyAccess.strategyId, strategyId), eq(strategyAccess.userId, userId)))
    .limit(1);
  return row ? higherLevel(base, row.permission) : base;
}

export type PermissionCheck = { ok: true; level: StrategyPermissionLevel } | { ok: false; error: string };

/** For server actions: resolve, compare against the action's minimum level,
 * and return a ready-to-use {error} shape on failure instead of throwing —
 * matches every other server action's return convention in this codebase. */
export async function checkStrategyPermission(
  userId: string,
  workspaceRole: WorkspaceRole,
  strategyId: string,
  min: StrategyPermissionLevel,
): Promise<PermissionCheck> {
  const level = await resolveStrategyPermission(userId, workspaceRole, strategyId);
  if (!meetsLevel(level, min)) {
    return { ok: false, error: `This action needs "${min.replace("_", " + ")}" access or higher on this strategy.` };
  }
  return { ok: true, level };
}

/**
 * Which of a workspace's strategies a user can see at all — used to filter
 * the strategy list query. A user sees a strategy if their workspace role
 * alone grants at least "view", OR they hold an explicit strategy_access row
 * (any level, since even the lowest rung is still visibility).
 */
export async function getViewableStrategyIds(
  workspaceId: string,
  userId: string,
  workspaceRole: WorkspaceRole,
): Promise<string[] | "all"> {
  if (meetsLevel(workspaceRoleStrategyLevel(workspaceRole), "view")) return "all";

  const rows = await db
    .select({ id: strategies.id })
    .from(strategies)
    .innerJoin(
      strategyAccess,
      and(eq(strategyAccess.strategyId, strategies.id), eq(strategyAccess.userId, userId)),
    )
    .where(eq(strategies.workspaceId, workspaceId));
  return rows.map((r) => r.id);
}

/** Narrow an already-fetched id list down to the viewable subset — used when
 * the caller already has strategy rows in hand and just needs to filter. */
export function filterViewableIds(ids: string[], viewable: string[] | "all"): string[] {
  if (viewable === "all") return ids;
  const allowed = new Set(viewable);
  return ids.filter((id) => allowed.has(id));
}
