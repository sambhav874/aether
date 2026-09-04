import { NextResponse, type NextRequest } from "next/server";
import { streamText, convertToModelMessages, stepCountIs, toUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";
import { requireActiveWorkspace } from "@/lib/auth/session";
import { resolveModelChoice, NoProviderKeyError } from "@/lib/ai/provider/prefs";
import { resolveLanguageModel } from "@/lib/ai/provider/models";
import { recordAiRun } from "@/lib/ai/provider/run-tracking";
import { buildToolRegistry } from "@/lib/ai/tools";
import { buildSystemPrompt } from "@/lib/ai/chat/system-prompt";
import { ensureOwnedThread, appendUserMessage, appendAssistantMessage, type AssistantTurn } from "@/lib/ai/chat/thread";

// Long enough for a multi-step tool loop (up to 8 steps, PLAN_AI_COPILOT.md
// §3's budget) plus provider latency, short of Vercel's hard ceiling.
export const maxDuration = 60;

type ChatRequestBody = {
  id?: string;
  messages: UIMessage[];
  pinnedSymbol?: string;
};

function extractText(message: UIMessage | undefined): string {
  if (!message) return "";
  return message.parts
    .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** A short, storage-safe stand-in for a tool result — the full payload lives in the message's `evidence` field; this is only for the toolCalls trace log (PLAN_AI_COPILOT.md §5's "name, args, result digest, latency, status"). */
function digest(value: unknown, maxLen = 300): string {
  try {
    const json = JSON.stringify(value);
    return json.length > maxLen ? `${json.slice(0, maxLen)}…` : json;
  } catch {
    return "[unserializable result]";
  }
}

/**
 * The Phase 1 hot-loop chat endpoint — see PLAN_AI_COPILOT.md §3 "Agent
 * loop" (default lane) and §4 (model resolution). Everything session-scoped
 * (workspaceId, userId) comes from requireActiveWorkspace() only; nothing
 * in the request body can widen that scope — see §7 "Cross-workspace data
 * leak".
 *
 * UNVERIFIED END TO END: written against the installed `ai@7.0.64` /
 * `@ai-sdk/react@4.0.67` API surface (confirmed via the packages' own type
 * declarations, not from memory), but has never been exercised against a
 * live model — no provider key has been configured in this environment.
 * Needs a real smoke test the moment a key lands, before trusting it.
 */
export async function POST(request: NextRequest) {
  const { workspace, session } = await requireActiveWorkspace();
  const workspaceId = workspace.id;
  const userId = session.user.id;

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }

  const thread = await ensureOwnedThread(body.id, { workspaceId, userId }, body.pinnedSymbol);

  const lastMessage = body.messages[body.messages.length - 1];
  if (lastMessage.role === "user") {
    const text = extractText(lastMessage);
    if (text) await appendUserMessage(thread.id, text);
  }

  let modelChoice;
  try {
    modelChoice = await resolveModelChoice(userId, "main_loop");
  } catch (error) {
    if (error instanceof NoProviderKeyError) {
      return NextResponse.json({ error: `AI unavailable — ${error.message}` }, { status: 503 });
    }
    throw error;
  }

  const tools = buildToolRegistry({ workspaceId, userId });
  const startedAt = Date.now();
  let lastStepAt = startedAt;
  const toolCallLog: AssistantTurn["toolCalls"] = [];
  const evidence: Record<string, unknown> = {};

  const rawModelMessages = await convertToModelMessages(body.messages, { tools });
  const modelMessages = rawModelMessages.map((msg) => {
    if (msg.role === "assistant") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const copy = { ...msg } as any;
      delete copy.reasoning;
      if (Array.isArray(copy.content)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        copy.content = copy.content.filter((part: any) => part.type !== "reasoning" && part.type !== "reasoning-file");
      }
      return copy;
    }
    return msg;
  });

  const result = streamText({
    model: resolveLanguageModel(modelChoice),
    system: buildSystemPrompt({ pinnedSymbol: body.pinnedSymbol }),
    messages: modelMessages,
    tools,
    providerOptions: {
      groq: {
        parallelToolCalls: false,
      },
    },
    stopWhen: stepCountIs(8),
    onStepFinish: (step) => {
      const now = Date.now();
      const stepLatencyMs = now - lastStepAt;
      lastStepAt = now;
      for (const call of step.toolCalls) {
        const matched = step.toolResults.find((r) => r.toolCallId === call.toolCallId);
        toolCallLog.push({
          name: call.toolName,
          args: call.input,
          resultDigest: digest(matched?.output),
          latencyMs: stepLatencyMs,
          status: matched ? "ok" : "error",
        });
        if (matched) evidence[call.toolCallId] = { tool: call.toolName, input: call.input, output: matched.output };
      }
    },
    onFinish: async ({ text, usage }) => {
      await appendAssistantMessage(thread.id, {
        content: text,
        toolCalls: toolCallLog,
        evidence,
        provider: modelChoice.provider,
        model: modelChoice.model,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
      });
      void recordAiRun({
        workspaceId,
        lane: "main_loop",
        provider: modelChoice.provider,
        model: modelChoice.model,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        latencyMs: Date.now() - startedAt,
        steps: toolCallLog.length,
        status: "ok",
      });
    },
    onError: ({ error }) => {
      let reason: string;
      if (error instanceof Error) {
        reason = error.message;
      } else {
        try {
          reason = JSON.stringify(error, Object.getOwnPropertyNames(error as object));
        } catch {
          reason = String(error);
        }
      }
      console.error("[api/ai/chat] stream error —", error);
      void recordAiRun({
        workspaceId,
        lane: "main_loop",
        provider: modelChoice.provider,
        model: modelChoice.model,
        latencyMs: Date.now() - startedAt,
        status: "error",
        errorCode: reason.slice(0, 200),
      });
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      // Default is `() => "An error occurred."` (deliberately generic, to
      // avoid leaking server internals). Worth a more specific message for
      // one class we see live: Groq's own strict tool-schema validator
      // occasionally rejects a malformed render_chart call before it ever
      // reaches our code — same prompt resent as-is has succeeded in
      // testing, since the next sample is rarely malformed the same way.
      // Still generic about anything else, for the same leak-avoidance
      // reason as the default.
      onError: (error) => {
        // Not necessarily an Error instance — Groq/OpenAI-compatible
        // provider errors arrive here as a plain {message, type} object
        // (confirmed live: `error instanceof Error` was false, which is
        // why an earlier version of this check silently never matched).
        const message = error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? String((error as { message: unknown }).message) : "";
        if (/tool call validation failed|failed to call a function/i.test(message)) {
          return "The AI had trouble formatting part of that response — this is usually transient, try sending the same message again.";
        }
        return "An error occurred.";
      },
    }),
    headers: { "X-Thread-Id": thread.id },
  });
}
