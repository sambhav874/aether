"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  ArrowRight,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  RotateCcw,
  Square,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/ai/markdown";
import { ToolChart } from "@/components/ai/tool-chart";
import { ToolTable } from "@/components/ai/tool-table";
import type { RenderChartInput, RenderTableInput } from "@/lib/ai/tools/render";

const SWISS_STARTER_QUERIES = [
  { code: "01", text: "Compare TCS and INFY fundamentals" },
  { code: "02", text: "Screen Indian stocks with ROE > 20%" },
  { code: "03", text: "Show NIFTY 50 candlestick trend" },
  { code: "04", text: "What is my trade win rate this month?" },
];

function rawTextOf(message: UIMessage): string {
  return message.parts
    .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function reasoningOf(message: UIMessage): { reasoningText: string; isStreaming: boolean } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reasoningParts = message.parts.filter((p): p is any => p.type === "reasoning");
  const nativeReasoning = reasoningParts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((p: any) => p.text || p.reasoning || "")
    .join("\n")
    .trim();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isReasoningStreaming = reasoningParts.some((p: any) => p.state === "input-streaming" || p.state === "streaming");

  const fullText = rawTextOf(message);
  const thinkMatches = Array.from(fullText.matchAll(/<think>([\s\S]*?)(?:<\/think>|$)/gi));
  const thinkTexts = thinkMatches.map((m) => m[1]?.trim()).filter(Boolean);

  const combinedReasoning = [nativeReasoning, ...thinkTexts].filter(Boolean).join("\n\n");
  const hasUnclosedThink = /<think>(?![\s\S]*<\/think>)/i.test(fullText);

  return {
    reasoningText: combinedReasoning,
    isStreaming: isReasoningStreaming || hasUnclosedThink,
  };
}

function cleanTextOf(message: UIMessage): string {
  let text = rawTextOf(message);
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  text = text.replace(/<think>[\s\S]*$/gi, "");
  return text.trim();
}

function toolNameOf(partType: string): string {
  return partType.startsWith("tool-") ? partType.slice(5) : partType;
}

function chartSpecsOf(message: UIMessage): RenderChartInput[] {
  const specs = message.parts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((p): p is any => p.type === "tool-render_chart" && p.state === "output-available")
    .map((p) => p.output as { status: "ok"; data: RenderChartInput } | { status: "unavailable"; reason: string })
    .filter((output): output is { status: "ok"; data: RenderChartInput } => output?.status === "ok")
    .map((output) => output.data);

  const seen = new Set<string>();
  return specs.filter((spec) => {
    const key = JSON.stringify(spec);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function tableSpecsOf(message: UIMessage): RenderTableInput[] {
  return message.parts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((p): p is any => p.type === "tool-render_table" && p.state === "output-available")
    .map((p) => p.output as { status: "ok"; data: RenderTableInput } | { status: "unavailable"; reason: string })
    .filter((output): output is { status: "ok"; data: RenderTableInput } => output?.status === "ok")
    .map((output) => output.data);
}

function SwissReasoningViewer({ reasoningText, isStreaming }: { reasoningText: string; isStreaming: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  if (!reasoningText && !isStreaming) return null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(reasoningText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 w-full border border-black/15 bg-[#111111]/[0.03] text-xs dark:border-white/15 dark:bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between border-b border-black/10 bg-black/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/70 transition hover:bg-black/10 dark:border-white/10 dark:bg-white/5"
      >
        <div className="flex items-center gap-2">
          <Brain className={cn("size-3 text-[#c8102e]", isStreaming && "animate-pulse")} />
          <span className="font-semibold text-foreground">
            {isStreaming ? "Thinking..." : "Thought"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {reasoningText && (
            <span
              onClick={handleCopy}
              className="text-[9px] hover:text-[#c8102e]"
              title="Copy thought"
            >
              {copied ? "Copied" : "Copy"}
            </span>
          )}
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </div>
      </button>

      {open && (
        <div className="max-h-48 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap">
          {reasoningText || <span className="italic">Formulating strategy & query parameters…</span>}
        </div>
      )}
    </div>
  );
}

export function AgentFloatingWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = React.useState(false);
  const [chatId, setChatId] = React.useState(() => crypto.randomUUID());
  const [input, setInput] = React.useState("");

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const isCopilotPage = pathname === "/dashboard/monarch/copilot";

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/chat",
        body: { id: chatId },
      }),
    [chatId]
  );

  const { messages, sendMessage, status, error, stop, setMessages } = useChat({
    id: chatId,
    transport,
  });

  const isStreaming = status === "streaming" || status === "submitted";

  React.useEffect(() => {
    if (isOpen) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [messages, isStreaming, isOpen]);

  const handleReset = () => {
    stop?.();
    setMessages?.([]);
    setChatId(crypto.randomUUID());
  };

  const handleSendPrompt = (promptText: string) => {
    if (!promptText.trim() || isStreaming) return;
    sendMessage({ text: promptText.trim() });
    setInput("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendPrompt(input);
  };

  if (isCopilotPage) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Swiss Floating Trigger Tag */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="group flex items-center gap-3 border border-black/20 bg-[#111111] px-4 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-[#f3f1ed] shadow-[5px_5px_0_#c8102e] transition hover:-translate-y-0.5 hover:shadow-[7px_7px_0_#c8102e] active:translate-y-0 dark:border-white/20"
          aria-label="Open Astra Agent"
        >
          <span className="size-2 bg-[#c8102e]" />
          <span className="font-medium">Astra // Agent</span>
        </button>
      )}

      {/* Swiss Architectural Chat Panel */}
      {isOpen && (
        <div className="flex h-[560px] w-[370px] max-w-[calc(100vw-2.5rem)] flex-col border border-black/20 bg-[#f3f1ed] text-[#111111] shadow-[8px_8px_0_#111111] dark:border-white/20 dark:bg-[#111111] dark:text-[#f3f1ed] dark:shadow-[8px_8px_0_#c8102e] sm:w-[410px]">
          {/* Swiss Header */}
          <div className="flex items-center justify-between border-b border-black/15 bg-black/5 px-4 py-3 dark:border-white/15 dark:bg-white/5">
            <div className="flex items-center gap-2.5 font-mono">
              <span className="flex size-6 items-center justify-center bg-[#c8102e] text-[10px] font-bold text-[#f3f1ed]">
                A
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold tracking-[-0.02em] uppercase">Astra</span>
                  <span className="text-[10px] text-black/40 dark:text-white/40">/ AGENT</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Link
                href="/dashboard/monarch/copilot"
                className="flex size-7 items-center justify-center border border-black/10 text-black/60 transition hover:border-[#c8102e] hover:text-[#c8102e] dark:border-white/10 dark:text-white/60"
                title="Full Workspace"
              >
                <ExternalLink className="size-3.5" />
              </Link>
              <button
                type="button"
                onClick={handleReset}
                className="flex size-7 items-center justify-center border border-black/10 text-black/60 transition hover:border-[#c8102e] hover:text-[#c8102e] dark:border-white/10 dark:text-white/60"
                title="Reset session"
              >
                <RotateCcw className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex size-7 items-center justify-center border border-black/10 text-black/60 transition hover:border-[#c8102e] hover:text-[#c8102e] dark:border-white/10 dark:text-white/60"
                title="Close"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Swiss Message / Launch Body */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 font-sans">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col justify-between py-2 font-mono">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#c8102e]">01 / AGENT DIRECT</p>
                  <h3 className="mt-3 text-2xl font-light tracking-[-0.04em] text-foreground">
                    Astra Desk.
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-black/60 dark:text-white/60">
                    Query multi-broker market telemetry, technical momentum, fundamental screening, and strategy performance.
                  </p>
                </div>

                <div className="space-y-2 border-t border-black/15 pt-4 dark:border-white/15">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-black/40 dark:text-white/40 block mb-2">
                    Quick Queries //
                  </span>
                  {SWISS_STARTER_QUERIES.map((q) => (
                    <button
                      key={q.code}
                      type="button"
                      onClick={() => handleSendPrompt(q.text)}
                      className="group flex w-full items-center justify-between border border-black/15 bg-white/40 p-2.5 text-left text-xs transition hover:border-[#c8102e] hover:bg-white dark:border-white/15 dark:bg-white/[0.02] dark:hover:bg-white/[0.06]"
                    >
                      <span className="text-[10px] text-black/40 dark:text-white/40 mr-2">{q.code}</span>
                      <span className="flex-1 truncate font-sans text-xs text-foreground group-hover:text-[#c8102e]">
                        {q.text}
                      </span>
                      <ArrowRight className="size-3 text-black/30 group-hover:text-[#c8102e] transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4 font-sans">
                {messages.map((m) => {
                  const isUser = m.role === "user";
                  const text = cleanTextOf(m);
                  const { reasoningText, isStreaming: isReasoningStreaming } = reasoningOf(m);
                  const toolParts = m.parts.filter((p) => p.type.startsWith("tool-"));
                  const charts = chartSpecsOf(m);
                  const tables = tableSpecsOf(m);

                  return (
                    <div key={m.id} className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
                      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-black/40 dark:text-white/40 px-1">
                        <span>{isUser ? "YOU" : "ASTRA"}</span>
                        <span>•</span>
                        <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>

                      {!isUser && (reasoningText || isReasoningStreaming) && (
                        <SwissReasoningViewer reasoningText={reasoningText} isStreaming={isReasoningStreaming} />
                      )}

                      {toolParts.length > 0 && (
                        <div className="flex flex-wrap gap-1 my-1">
                          {toolParts.map((p, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 border border-black/10 bg-black/5 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-black/60 dark:border-white/10 dark:bg-white/5 dark:text-white/60"
                            >
                              <Wrench className="size-2.5 text-[#c8102e]" />
                              {toolNameOf(p.type)}
                            </span>
                          ))}
                        </div>
                      )}

                      {charts.length > 0 && (
                        <div className="w-full space-y-2">
                          {charts.map((c, i) => (
                            <ToolChart key={i} input={c} />
                          ))}
                        </div>
                      )}

                      {tables.length > 0 && (
                        <div className="w-full space-y-2">
                          {tables.map((t, i) => (
                            <ToolTable key={i} input={t} />
                          ))}
                        </div>
                      )}

                      {text ? (
                        isUser ? (
                          <div className="max-w-[88%] border border-black/15 bg-[#111111] px-3.5 py-2 text-xs leading-relaxed text-[#f3f1ed] dark:border-white/15 dark:bg-neutral-800 dark:text-foreground">
                            {text}
                          </div>
                        ) : (
                          <div className="w-full border-l-2 border-[#c8102e] border-y border-r border-black/10 bg-white/60 p-3 text-xs leading-relaxed dark:border-white/10 dark:bg-neutral-900/60">
                            <Markdown>{text}</Markdown>
                          </div>
                        )
                      ) : null}
                    </div>
                  );
                })}

                {isStreaming && (
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-black/50 dark:text-white/50 py-1">
                    <span className="size-1.5 bg-[#c8102e] animate-ping" />
                    <span>Thinking...</span>
                  </div>
                )}

                {error && (
                  <div className="border border-[#c8102e] bg-[#c8102e]/10 p-2.5 font-mono text-[11px] text-[#c8102e]">
                    {error.message || "Execution failed. Retry query."}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Swiss Input Footer */}
          <form onSubmit={handleSubmit} className="border-t border-black/15 bg-black/5 p-3 dark:border-white/15 dark:bg-white/5">
            <div className="flex items-center gap-2 border border-black/15 bg-white px-3 py-1.5 dark:border-white/15 dark:bg-[#111111]">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Astra..."
                disabled={isStreaming}
                className="flex-1 bg-transparent font-sans text-xs outline-none placeholder:text-black/40 dark:placeholder:text-white/40 disabled:opacity-50"
              />

              {isStreaming ? (
                <button
                  type="button"
                  onClick={() => stop?.()}
                  className="bg-[#c8102e] p-1.5 text-white hover:bg-[#a00d25]"
                  aria-label="Stop"
                >
                  <Square className="size-3 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className={cn(
                    "p-1.5 font-mono text-[10px] uppercase tracking-wider transition",
                    input.trim()
                      ? "bg-[#111111] text-[#f3f1ed] hover:bg-[#c8102e] dark:bg-white dark:text-black dark:hover:bg-[#c8102e] dark:hover:text-white"
                      : "text-black/30 dark:text-white/30"
                  )}
                  aria-label="Send"
                >
                  <ArrowRight className="size-3.5" />
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
