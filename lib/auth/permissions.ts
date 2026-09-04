import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc, ownerAc, memberAc } from "better-auth/plugins/organization/access";

/**
 * Workspace-level roles (coarse gate). Per-strategy fine-grained ACLs
 * (view/execute/manage on an individual strategy) are a separate layer —
 * see `strategy_access` in db/schema/strategies.ts, built in Phase 4.
 *
 * Full 9-role catalog: Owner, Admin, Strategist, Trader, Analyst,
 * Researcher, Integrations Manager, Integrations Viewer, Viewer.
 */
export const statement = {
  ...defaultStatements,
  trading: ["view", "execute"],
  broker: ["connect", "manage"],
  billing: ["manage"],
  // Coarse workspace-level strategy CRUD (create/pause/delete/link
  // accounts) — distinct from strategy_access, which gates visibility into
  // one specific strategy's signals regardless of workspace role.
  strategies: ["view", "manage"],
  // Gates the Research/News page (Group 2, vendor-gated, not built yet) —
  // added now so the role catalog doesn't need another migration later.
  research: ["view"],
} as const;

export const ac = createAccessControl(statement);

export const owner = ac.newRole({
  ...ownerAc.statements,
  trading: ["view", "execute"],
  broker: ["connect", "manage"],
  billing: ["manage"],
  strategies: ["view", "manage"],
  research: ["view"],
});

export const admin = ac.newRole({
  ...adminAc.statements,
  trading: ["view", "execute"],
  broker: ["connect", "manage"],
  billing: [],
  strategies: ["view", "manage"],
  research: ["view"],
});

/** Owns the strategy engine — configures/pauses strategies, links broker
 * accounts to them — but doesn't manage broker connections or billing. */
export const strategist = ac.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: [],
  trading: ["view", "execute"],
  broker: [],
  billing: [],
  strategies: ["view", "manage"],
  research: ["view"],
});

export const trader = ac.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: [],
  trading: ["view", "execute"],
  broker: [],
  billing: [],
  strategies: ["view"],
  research: ["view"],
});

/** Read-only performance/analytics focus — can see everything trading-wise
 * but can't place or close orders. */
export const analyst = ac.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: [],
  trading: ["view"],
  broker: [],
  billing: [],
  strategies: ["view"],
  research: ["view"],
});

/** News/market-research focus — minimal trading visibility. */
export const researcher = ac.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: [],
  trading: ["view"],
  broker: [],
  billing: [],
  strategies: [],
  research: ["view"],
});

/** Owns broker connections (connect/reconnect/whitelist accounts) without
 * trading or strategy-management rights. */
export const integrationsManager = ac.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: [],
  trading: ["view"],
  broker: ["connect", "manage"],
  billing: [],
  strategies: ["view"],
  research: [],
});

/** Can see broker/connection health without being able to add, remove, or
 * reconnect accounts. */
export const integrationsViewer = ac.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: [],
  trading: ["view"],
  broker: [],
  billing: [],
  strategies: [],
  research: [],
});

export const viewer = ac.newRole({
  ...memberAc.statements,
  trading: ["view"],
  broker: [],
  billing: [],
  strategies: [],
  research: [],
});

export const ROLE_LABELS = {
  owner: "Owner",
  admin: "Admin",
  strategist: "Strategist",
  trader: "Trader",
  analyst: "Analyst",
  researcher: "Researcher",
  integrationsManager: "Integrations Manager",
  integrationsViewer: "Integrations Viewer",
  viewer: "Viewer",
} as const;

export type WorkspaceRole = keyof typeof ROLE_LABELS;

export const ROLE_OBJECTS = {
  owner,
  admin,
  strategist,
  trader,
  analyst,
  researcher,
  integrationsManager,
  integrationsViewer,
  viewer,
} as const satisfies Record<WorkspaceRole, unknown>;

export const ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  owner: "Full access to everything including billing and workspace deletion.",
  admin: "Manage members, integrations and runners. No billing access.",
  strategist: "Full access to every strategy in the workspace — view, build, edit, execute, delete and share.",
  trader: "Execute live trades on connected brokers.",
  analyst: "Read access to all data plus ability to run analyses.",
  researcher: "Access to research suite, AI chat and document ingestion.",
  integrationsManager: "View and edit broker / data integrations — connect, configure and revoke connections.",
  integrationsViewer:
    "View-only access to integrations. Sees connection name and status; financial figures, credentials and actions are hidden.",
  viewer: "Read-only access. Can view dashboards but make no changes.",
};

type PermissionQuery = Parameters<(typeof ROLE_OBJECTS)["viewer"]["authorize"]>[0];

/** Coarse workspace-role permission check (sync, no DB call) — the actual
 * enforcement for `statement` (trading/broker/billing/strategies/research).
 * Unknown/legacy role strings fall back to `viewer`'s statements rather than
 * throwing, since a bad role string shouldn't accidentally grant access. */
export function hasWorkspacePermission(role: string, permissions: PermissionQuery): boolean {
  const roleObject = ROLE_OBJECTS[role as WorkspaceRole] ?? ROLE_OBJECTS.viewer;
  return roleObject.authorize(permissions).success;
}
