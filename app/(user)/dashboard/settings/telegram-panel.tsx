"use client";

import * as React from "react";
import { Send, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  listDetectedTelegramChats,
  addTelegramConnection,
  toggleTelegramConnection,
  deleteTelegramConnection,
  sendTelegramTestMessage,
} from "@/lib/telegram/actions";
import type { DetectedChat } from "@/lib/telegram/send";

export type TelegramConnection = {
  id: string;
  chatId: string;
  label: string;
  active: boolean;
};

function ConnectionRow({ connection }: { connection: TelegramConnection }) {
  const [pending, startTransition] = React.useTransition();
  const [testResult, setTestResult] = React.useState<string | null>(null);

  return (
    <div className="rounded-md border px-3 py-2 text-sm">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{connection.label}</p>
          <p className="text-xs text-muted-foreground">chat id: {connection.chatId}</p>
        </div>
        <Switch
          checked={connection.active}
          disabled={pending}
          onCheckedChange={() => startTransition(() => toggleTelegramConnection(connection.id))}
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          title="Send test message"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await sendTelegramTestMessage(connection.id);
              setTestResult(result.error ? `Failed: ${result.error}` : "Sent.");
            })
          }
        >
          <Send className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={pending}
          onClick={() => startTransition(() => deleteTelegramConnection(connection.id))}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      {testResult && <p className="mt-1 text-xs text-muted-foreground">{testResult}</p>}
    </div>
  );
}

export function TelegramPanel({ connections }: { connections: TelegramConnection[] }) {
  const [detected, setDetected] = React.useState<DetectedChat[] | null>(null);
  const [detectError, setDetectError] = React.useState<string | null>(null);
  const [labels, setLabels] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();
  const [addError, setAddError] = React.useState<string | null>(null);

  function detectChats() {
    startTransition(async () => {
      setDetectError(null);
      const result = await listDetectedTelegramChats();
      if (result.error) {
        setDetectError(result.error);
        setDetected(null);
      } else {
        setDetected(result.chats);
      }
    });
  }

  function addChat(chat: DetectedChat) {
    const label = labels[chat.chatId]?.trim() || chat.title;
    startTransition(async () => {
      const result = await addTelegramConnection(chat.chatId, label);
      setAddError(result.error ?? null);
      if (!result.error) setDetected((prev) => prev?.filter((c) => c.chatId !== chat.chatId) ?? null);
    });
  }

  const connectedChatIds = new Set(connections.map((c) => c.chatId));

  return (
    <div className="max-w-lg space-y-4">
      <p className="text-xs text-muted-foreground">
        Add the bot to a Telegram group (or DM it), then detect it here to connect it as a delivery
        channel for the notification categories above.
      </p>

      {connections.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          No Telegram connections yet.
        </p>
      ) : (
        <div className="space-y-2">
          {connections.map((c) => (
            <ConnectionRow key={c.id} connection={c} />
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Button variant="outline" size="sm" onClick={detectChats} disabled={pending}>
          <RefreshCw className="size-4" />
          Detect chats
        </Button>
        {detectError && <p className="text-xs text-negative">{detectError}</p>}
        {addError && <p className="text-xs text-negative">{addError}</p>}

        {detected && detected.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No new chats seen — message the bot or add it to a group first, then try again.
          </p>
        )}

        {detected && detected.length > 0 && (
          <div className="space-y-2">
            {detected
              .filter((chat) => !connectedChatIds.has(chat.chatId))
              .map((chat) => (
                <div key={chat.chatId} className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{chat.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {chat.type} · {chat.chatId}
                    </p>
                  </div>
                  <Input
                    placeholder="Label"
                    defaultValue={chat.title}
                    className="w-32"
                    onChange={(e) => setLabels((prev) => ({ ...prev, [chat.chatId]: e.target.value }))}
                  />
                  <Button size="sm" disabled={pending} onClick={() => addChat(chat)}>
                    Add
                  </Button>
                </div>
              ))}
          </div>
        )}
      </div>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Add by chat ID manually</summary>
        <form
          className="mt-2 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const chatId = String(form.get("chatId") ?? "");
            const label = String(form.get("label") ?? "");
            startTransition(async () => {
              const result = await addTelegramConnection(chatId, label);
              setAddError(result.error ?? null);
              if (!result.error) e.currentTarget.reset();
            });
          }}
        >
          <div className="space-y-1">
            <Label className="text-xs">Chat ID</Label>
            <Input name="chatId" className="w-32" required />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Label</Label>
            <Input name="label" className="w-32" required />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            Add
          </Button>
        </form>
      </details>
    </div>
  );
}
