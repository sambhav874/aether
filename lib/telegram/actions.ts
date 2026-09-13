"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { telegramConnections } from "@/db/schema";
import { requireActiveWorkspace } from "@/lib/auth/session";
import { idSchema, labelSchema } from "@/lib/validation";
import { parseInput } from "@/lib/strategies/schemas";
import { detectRecentTelegramChats, sendTelegramMessage, type DetectedChat } from "@/lib/telegram/send";
import { logAudit } from "@/lib/audit/log";

export async function listDetectedTelegramChats(): Promise<{ chats: DetectedChat[]; error?: string }> {
  const result = await detectRecentTelegramChats();
  if (!result.ok) return { chats: [], error: result.message };
  return { chats: result.chats ?? [] };
}

export async function addTelegramConnection(chatId: string, label: string): Promise<{ error?: string }> {
  const { workspace, session } = await requireActiveWorkspace();
  const checkedChat = parseInput(idSchema, chatId);
  const checkedLabel = parseInput(labelSchema, label);
  if (!checkedChat.ok || !checkedLabel.ok) return { error: "Chat and label are required." };
  chatId = checkedChat.data;
  label = checkedLabel.data;

  try {
    await db.insert(telegramConnections).values({
      id: crypto.randomUUID(),
      workspaceId: workspace.id,
      chatId: chatId.trim(),
      label: label.trim(),
      createdBy: session.user.id,
    });
    await logAudit({
      workspaceId: workspace.id,
      actorId: session.user.id,
      action: "telegram.connected",
      summary: `Connected Telegram chat "${label.trim()}"`,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save connection." };
  }

  revalidatePath("/dashboard/settings");
  return {};
}

export async function toggleTelegramConnection(id: string): Promise<void> {
  const { workspace, session } = await requireActiveWorkspace();
  const [row] = await db
    .select({ active: telegramConnections.active, label: telegramConnections.label })
    .from(telegramConnections)
    .where(and(eq(telegramConnections.id, id), eq(telegramConnections.workspaceId, workspace.id)));
  if (!row) return;

  const next = !row.active;
  await db
    .update(telegramConnections)
    .set({ active: next })
    .where(eq(telegramConnections.id, id));

  await logAudit({
    workspaceId: workspace.id,
    actorId: session.user.id,
    action: next ? "telegram.enabled" : "telegram.disabled",
    summary: `${next ? "Enabled" : "Disabled"} Telegram chat "${row.label}"`,
  });
  revalidatePath("/dashboard/settings");
}

export async function deleteTelegramConnection(id: string): Promise<void> {
  const { workspace, session } = await requireActiveWorkspace();
  const [row] = await db
    .select({ label: telegramConnections.label })
    .from(telegramConnections)
    .where(and(eq(telegramConnections.id, id), eq(telegramConnections.workspaceId, workspace.id)));
  if (!row) return;

  await db
    .delete(telegramConnections)
    .where(and(eq(telegramConnections.id, id), eq(telegramConnections.workspaceId, workspace.id)));

  await logAudit({
    workspaceId: workspace.id,
    actorId: session.user.id,
    action: "telegram.deleted",
    summary: `Deleted Telegram chat "${row.label}"`,
  });
  revalidatePath("/dashboard/settings");
}

export async function sendTelegramTestMessage(id: string): Promise<{ error?: string }> {
  const { workspace } = await requireActiveWorkspace();
  const [row] = await db
    .select({ chatId: telegramConnections.chatId })
    .from(telegramConnections)
    .where(and(eq(telegramConnections.id, id), eq(telegramConnections.workspaceId, workspace.id)));
  if (!row) return { error: "Connection not found." };

  const result = await sendTelegramMessage(row.chatId, "✅ Aether test notification — this connection is working.");
  if (!result.ok) return { error: result.message };
  return {};
}
