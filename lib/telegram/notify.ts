import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { telegramConnections, notificationPreferences } from "@/db/schema";
import { sendTelegramMessage } from "@/lib/telegram/send";

export type NotificationCategory = "signalAlerts" | "brokerDisconnected" | "strategyPaused" | "securityAlerts";

/**
 * notification_preferences is per-user ("what do I want to hear about");
 * Telegram connections are workspace-wide channels with no per-user
 * targeting. Treat the category as wanted for the workspace if any member
 * has it on, or if no one has set a preference yet at all (matches the
 * column defaults, which are all `true`).
 */
async function workspaceWantsCategory(workspaceId: string, category: NotificationCategory): Promise<boolean> {
  const rows = await db
    .select({ value: notificationPreferences[category] })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.workspaceId, workspaceId));

  if (rows.length === 0) return true;
  return rows.some((r) => r.value);
}

/**
 * Fire-and-forget by design — a Telegram outage or a bad chat ID must never
 * block or fail the real action (signal dispatch, broker sync, etc.) this is
 * attached to. Never awaited by callers for that reason.
 */
export async function notifyWorkspace(workspaceId: string, category: NotificationCategory, message: string): Promise<void> {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) return;
    if (!(await workspaceWantsCategory(workspaceId, category))) return;

    const connections = await db
      .select({ id: telegramConnections.id, chatId: telegramConnections.chatId })
      .from(telegramConnections)
      .where(and(eq(telegramConnections.workspaceId, workspaceId), eq(telegramConnections.active, true)));

    await Promise.all(
      connections.map(async (conn) => {
        const result = await sendTelegramMessage(conn.chatId, message);
        if (!result.ok) {
          console.error(`[telegram] delivery failed for connection ${conn.id}: ${result.message}`);
        }
      }),
    );
  } catch (error) {
    console.error("[telegram] notifyWorkspace error —", error);
  }
}
