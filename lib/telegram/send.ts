import "server-only";
import { fetchWithTimeout, CONTENT_TIMEOUT_MS } from "@/lib/http";

const BASE_URL = "https://api.telegram.org";

function getToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set — required for Telegram notifications.");
  }
  return token;
}

type TelegramApiResult<T> = { ok: boolean; result?: T; description?: string };

async function callTelegram<T>(method: string, body?: Record<string, unknown>): Promise<TelegramApiResult<T>> {
  const res = await fetchWithTimeout(`${BASE_URL}/bot${getToken()}/${method}`, {
    timeoutMs: CONTENT_TIMEOUT_MS,
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as TelegramApiResult<T>;
  return data;
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<{ ok: boolean; message: string }> {
  try {
    const data = await callTelegram("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
    if (!data.ok) return { ok: false, message: data.description ?? "unknown Telegram API error" };
    return { ok: true, message: "sent" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "network error" };
  }
}

export async function getTelegramBotUsername(): Promise<{ ok: boolean; username?: string; message?: string }> {
  try {
    const data = await callTelegram<{ username: string }>("getMe");
    if (!data.ok || !data.result) return { ok: false, message: data.description ?? "unknown Telegram API error" };
    return { ok: true, username: data.result.username };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "network error" };
  }
}

export type DetectedChat = { chatId: string; title: string; type: string };

type TelegramChat = { id: number; type: string; title?: string; first_name?: string; last_name?: string; username?: string };
type TelegramUpdate = {
  message?: { chat: TelegramChat };
  channel_post?: { chat: TelegramChat };
  my_chat_member?: { chat: TelegramChat };
};

function chatLabel(chat: TelegramChat): string {
  const fullName = [chat.first_name, chat.last_name].filter(Boolean).join(" ");
  return chat.title ?? (fullName || chat.username) ?? String(chat.id);
}

/**
 * Reads Telegram's own update queue (getUpdates) to find chats the bot has
 * recently seen — the user adds the bot to a group (or DMs it) then clicks
 * "detect chats" in the UI, sidestepping the usual manual chat-ID lookup.
 * Not a webhook subscription; safe to call occasionally without conflicting
 * with anything else, since this app never registers a Telegram webhook.
 */
export async function detectRecentTelegramChats(): Promise<{ ok: boolean; chats?: DetectedChat[]; message?: string }> {
  try {
    const data = await callTelegram<TelegramUpdate[]>("getUpdates?limit=100");
    if (!data.ok || !data.result) return { ok: false, message: data.description ?? "unknown Telegram API error" };

    const seen = new Map<string, DetectedChat>();
    for (const update of data.result) {
      const chat = update.message?.chat ?? update.channel_post?.chat ?? update.my_chat_member?.chat;
      if (!chat) continue;
      seen.set(String(chat.id), { chatId: String(chat.id), title: chatLabel(chat), type: chat.type });
    }
    return { ok: true, chats: Array.from(seen.values()) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "network error" };
  }
}
