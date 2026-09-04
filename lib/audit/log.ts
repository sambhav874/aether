import "server-only";
import { db } from "@/db/client";
import { auditLog } from "@/db/schema";
import { notifyWorkspace, type NotificationCategory } from "@/lib/telegram/notify";

// Every logAudit() call already carries a workspace + a human-readable
// summary, so this is the one place to fan out Telegram delivery from
// instead of hand-wiring it at each of the ~10 call sites — only these three
// actions map to a notification_preferences category (signal-level alerts
// are wired separately, straight from the webhook routes, since they don't
// go through the audit log at all).
const ACTION_CATEGORY: Record<string, NotificationCategory> = {
  "broker.disconnected": "brokerDisconnected",
  "strategy.paused": "strategyPaused",
  "member.removed": "securityAlerts",
  "member.role_changed": "securityAlerts",
};

export async function logAudit(params: {
  workspaceId: string;
  actorId: string | null;
  action: string;
  summary: string;
  status?: "success" | "failure";
}): Promise<void> {
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    workspaceId: params.workspaceId,
    actorId: params.actorId,
    action: params.action,
    summary: params.summary,
    status: params.status ?? "success",
  });

  const category = ACTION_CATEGORY[params.action];
  if (category && (params.status ?? "success") === "success") {
    void notifyWorkspace(params.workspaceId, category, params.summary);
  }
}
