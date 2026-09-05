"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  ArrowRight,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Copy,
  Download,
  Flame,
  LineChart as ChartIcon,
  RotateCcw,
  Square,
  Tag,
  TrendingUp,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/ai/markdown";
import { ToolChart } from "@/components/ai/tool-chart";
import { ToolTable } from "@/components/ai/tool-table";
import type { RenderChartInput, RenderTableInput } from "@/lib/ai/tools/render";

type CopilotChatProps = { pinnedSymbol?: string };

const HOT_TICKERS = [
  { code: "01", symbol: "NIFTY 50", market: "IND" },
  { code: "02", symbol: "BANKNIFTY", market: "IND" },
  { code: "03", symbol: "RELIANCE", market: "NSE" },
  { code: "04", symbol: "TCS", market: "NSE" },
  { code: "05", symbol: "HDFCBANK", market: "NSE" },
  { code: "06", symbol: "AAPL", market: "US" },
  { code: "07", symbol: "NVDA", market: "US" },
  { code: "08", symbol: "EURUSD", market: "FX" },
  { code: "09", symbol: "XAUUSD", market: "FX" },
];

const STARTER_PROMPTS = [
  {
    category: "Valuation & Fundamentals",
    code: "01",
    icon: Compass,
    title: "Compare Tech Giants",
    prompt: "Compare TCS and INFY on P/E ratio, ROE, revenue growth, and profit margins.",
    desc: "Multi-metric valuation, margin & balance-sheet breakdown",
  },
  {
    category: "Valuation & Fundamentals",
    code: "02",
    icon: Flame,
    title: "High ROE Screener",
    prompt: "Screen Indian equity for companies with ROE > 20% and P/E < 30, sorted by market cap.",
    desc: "Quantitative quality-at-a-reasonable-price screen",
  },
  {
    category: "Market Structure",
    code: "03",
    icon: ChartIcon,
    title: "NIFTY 50 Trend & Chart",
    prompt: "Show the daily candlestick structure and price action for NIFTY 50 with key technical indicators.",
    desc: "OHLC candle chart with EMA & RSI momentum read",
  },
  {
    category: "Market Structure",
    code: "04",
    icon: TrendingUp,
    title: "Gold / XAUUSD Analysis",
    prompt: "Analyze the current technical momentum and trend structure of XAUUSD.",
    desc: "Forex & commodity price action review",
  },
  {
    category: "Trading Performance",
    code: "05",
    icon: Zap,
    title: "Monthly Trade Scorecard",
    prompt: "Analyze my trading performance and win rate this month. Break down results by strategy and symbol.",
    desc: "Execution win-rate, expectancy & PnL report",
  },
  {
    category: "Trading Performance",
    code: "06",
    icon: Wrench,
    title: "Risk & Exposure Check",
    prompt: "Check my current open positions, risk levels, and verify if guardrails are intact.",
    desc: "Active exposure, drawdown & account risk check",
  },
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
  const [open, setOpen] = React.useState(true);
  const [copied, setCopied] = React.useState(false);

  if (!reasoningText && !isStreaming) return null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(reasoningText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2.5 w-full border border-black/15 bg-[#111111]/[0.03] text-xs dark:border-white/15 dark:bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between border-b border-black/10 bg-black/5 px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/70 transition hover:bg-black/10 dark:border-white/10 dark:bg-white/5"
      >
        <div className="flex items-center gap-2">
          <Brain className={cn("size-3.5 text-[#c8102e]", isStreaming && "animate-pulse")} />
          <span className="font-semibold text-foreground">
            {isStreaming ? "Thinking..." : "Thought"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {reasoningText && (
            <span
              onClick={handleCopy}
              className="text-[10px] hover:text-[#c8102e] transition-colors"
              title="Copy thought"
            >
              {copied ? "Copied" : "Copy"}
            </span>
          )}
          <span className="text-[10px] text-black/40 dark:text-white/40">{open ? "Collapse" : "Expand"}</span>
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </div>
      </button>

      {open && (
        <div className="max-h-72 overflow-y-auto p-3.5 font-mono text-xs leading-relaxed text-black/70 dark:text-white/70 whitespace-pre-wrap">
          {reasoningText || <span className="italic text-black/40 dark:text-white/40">Formulating execution telemetry & parameters…</span>}
        </div>
      )}
    </div>
  );
}

function SwissToolDrawer({ toolParts }: { toolParts: UIMessage["parts"] }) {
  const [open, setOpen] = React.useState(false);

  const isPending = toolParts.some((p) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = (p as any).state;
    return state === "input-streaming" || state === "input-available";
  });

  const toolNames = toolParts.map((p) => toolNameOf(p.type));
  const uniqueNames = Array.from(new Set(toolNames));

  return (
    <div className="my-2 w-full border border-black/15 bg-[#111111]/[0.02] text-xs dark:border-white/15 dark:bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between border-b border-black/10 bg-black/5 px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/70 transition hover:bg-black/10 dark:border-white/10 dark:bg-white/5"
      >
        <div className="flex items-center gap-2">
          <Wrench className={cn("size-3 text-[#c8102e]", isPending && "animate-spin")} />
          <span className="font-semibold text-foreground">
            {isPending ? "Executing tools..." : `Tools (${toolParts.length})`}
          </span>
          <span className="text-black/40 dark:text-white/40">• {uniqueNames.join(", ")}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wider text-black/40 dark:text-white/40">
            {isPending ? "Running" : "Done"}
          </span>
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </div>
      </button>

      {open && (
        <div className="divide-y divide-black/10 border-t border-black/10 bg-black/[0.02] p-2.5 font-mono text-[11px] dark:divide-white/10 dark:border-white/10 dark:bg-white/[0.02]">
          {toolParts.map((p, i) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const part = p as any;
            const name = toolNameOf(p.type);
            const state = part.state ?? "output-available";
            const isStreaming = state === "input-streaming" || state === "input-available";
            const output = part.output;
            const isUnavailable = output?.status === "unavailable";

            return (
              <div key={i} className="py-1.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between text-black/60 dark:text-white/60">
                  <span className="font-semibold text-foreground">{name}</span>
                  <span
                    className={cn(
                      "text-[9px] uppercase tracking-wider font-mono",
                      isStreaming ? "text-[#c8102e] animate-pulse" : isUnavailable ? "text-[#c8102e]" : "text-black/50 dark:text-white/50"
                    )}
                  >
                    {isStreaming ? "Running" : isUnavailable ? "Unavailable" : "Success"}
                  </span>
                </div>
                {isUnavailable && output?.reason && (
                  <p className="mt-1 text-[10px] text-[#c8102e]">{output.reason}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const SwissMessageRow = React.memo(function SwissMessageRow({
  message,
  onCopyText,
}: {
  message: UIMessage;
  onCopyText: (text: string) => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const isUser = message.role === "user";
  const toolParts = message.parts.filter((p) => p.type.startsWith("tool-"));
  const text = cleanTextOf(message);
  const { reasoningText, isStreaming: isReasoningStreaming } = reasoningOf(message);
  const charts = chartSpecsOf(message);
  const tables = tableSpecsOf(message);

  const handleCopy = () => {
    onCopyText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("flex w-full flex-col py-3", isUser ? "items-end" : "items-start")}>
      <div className="flex items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-black/40 dark:text-white/40">
        <span className={cn(isUser ? "text-foreground font-semibold" : "text-[#c8102e] font-semibold")}>
          {isUser ? "USER // QUERY" : "ASTRA // COPILOT"}
        </span>
        <span>•</span>
        <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>

      <div className={cn("mt-1.5 flex max-w-[94%] flex-col gap-2 sm:max-w-[88%]", isUser && "items-end")}>
        {!isUser && (reasoningText || isReasoningStreaming) && (
          <SwissReasoningViewer reasoningText={reasoningText} isStreaming={isReasoningStreaming} />
        )}

        {toolParts.length > 0 && <SwissToolDrawer toolParts={toolParts} />}

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
            <div className="border border-black/20 bg-[#111111] px-4 py-3 text-sm leading-relaxed text-[#f3f1ed] dark:border-white/20 dark:bg-neutral-800 dark:text-foreground">
              {text}
            </div>
          ) : (
            <div className="w-full border-l-2 border-[#c8102e] border-y border-r border-black/15 bg-white/70 p-4 text-sm leading-relaxed text-foreground dark:border-white/15 dark:bg-neutral-900/70">
              <Markdown>{text}</Markdown>

              <div className="mt-3 flex items-center justify-end border-t border-black/10 pt-2 font-mono text-[10px] uppercase tracking-wider text-black/40 dark:border-white/10 dark:text-white/40">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 text-black/60 hover:text-[#c8102e] dark:text-white/60 dark:hover:text-[#c8102e]"
                >
                  {copied ? (
                    <>
                      <Check className="size-3 text-[#c8102e]" />
                      <span className="text-[#c8102e]">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
});

export function CopilotChat({ pinnedSymbol: initialPinnedSymbol }: CopilotChatProps) {
  const [chatId, setChatId] = React.useState(() => crypto.randomUUID());
  const [pinnedSymbol, setPinnedSymbol] = React.useState<string | undefined>(initialPinnedSymbol);
  const [input, setInput] = React.useState("");
  const [showSymbolPicker, setShowSymbolPicker] = React.useState(false);
  const [customSymbolInput, setCustomSymbolInput] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState<string>("All");

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/chat",
        body: { id: chatId, pinnedSymbol },
      }),
    [chatId, pinnedSymbol]
  );

  const { messages, sendMessage, status, error, stop, setMessages } = useChat({
    id: chatId,
    transport,
  });

  const isStreaming = status === "streaming" || status === "submitted";

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isStreaming]);

  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const handleResetSession = () => {
    stop?.();
    setMessages?.([]);
    setChatId(crypto.randomUUID());
  };

  const handleExportTranscript = () => {
    if (messages.length === 0) return;
    const transcript = messages
      .map((m) => {
        const role = m.role === "user" ? "USER" : "ASTRA";
        const { reasoningText } = reasoningOf(m);
        const content = cleanTextOf(m);
        const reasoningBlock = reasoningText ? `\n> **Thought:**\n> ${reasoningText.replace(/\n/g, "\n> ")}\n` : "";
        return `### ${role}\n${reasoningBlock}\n${content}\n`;
      })
      .join("\n---\n\n");

    const blob = new Blob([transcript], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `astra-copilot-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleSendPrompt = (promptText: string) => {
    if (!promptText.trim() || isStreaming) return;
    sendMessage({ text: promptText.trim() });
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendPrompt(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendPrompt(input);
    }
  };

  const categories = ["All", ...Array.from(new Set(STARTER_PROMPTS.map((p) => p.category)))];

  const filteredPrompts =
    selectedCategory === "All"
      ? STARTER_PROMPTS
      : STARTER_PROMPTS.filter((p) => p.category === selectedCategory);

  return (
    <div className="relative flex h-[calc(100vh-6.5rem)] w-full flex-col border border-black/15 bg-[#f3f1ed] text-[#111111] dark:border-white/15 dark:bg-[#111111] dark:text-[#f3f1ed]">
      {/* Swiss Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/15 bg-black/5 px-4 py-3 dark:border-white/15 dark:bg-white/5 sm:px-6">
        <div className="flex items-center gap-3 font-mono">
          <span className="flex size-7 items-center justify-center bg-[#c8102e] text-xs font-bold text-[#f3f1ed]">
            A
          </span>
          <div>
            <span className="text-sm font-semibold tracking-[-0.04em] uppercase">Astra Copilot</span>
            <span className="ml-2 text-[10px] text-black/40 dark:text-white/40">/ DESK</span>
          </div>
        </div>

        {/* Action Controls & Pinned Symbol */}
        <div className="flex items-center gap-2">
          {pinnedSymbol ? (
            <div className="flex items-center gap-1.5 border border-black/20 bg-white px-3 py-1 font-mono text-xs font-medium text-foreground dark:border-white/20 dark:bg-neutral-900">
              <Tag className="size-3 text-[#c8102e]" />
              <span>{pinnedSymbol}</span>
              <button
                type="button"
                onClick={() => setPinnedSymbol(undefined)}
                className="text-black/40 hover:text-[#c8102e] dark:text-white/40"
                title="Clear pinned symbol"
              >
                <X className="size-3" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSymbolPicker(!showSymbolPicker)}
                className="inline-flex items-center gap-1.5 border border-black/15 bg-white/60 px-3 py-1 font-mono text-xs font-medium text-black/60 transition hover:border-[#c8102e] hover:text-[#c8102e] dark:border-white/15 dark:bg-white/5 dark:text-white/60"
              >
                <Tag className="size-3" />
                <span>PIN SYMBOL</span>
              </button>

              {showSymbolPicker && (
                <div className="absolute right-0 top-full z-50 mt-2 w-64 border border-black/20 bg-[#f3f1ed] p-3 shadow-[6px_6px_0_#111111] dark:border-white/20 dark:bg-[#111111] dark:shadow-[6px_6px_0_#c8102e]">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/50 dark:text-white/50 mb-2">
                    Quick Select Symbol //
                  </p>
                  <div className="grid grid-cols-3 gap-1.5 font-mono">
                    {HOT_TICKERS.map((t) => (
                      <button
                        key={t.symbol}
                        type="button"
                        onClick={() => {
                          setPinnedSymbol(t.symbol);
                          setShowSymbolPicker(false);
                        }}
                        className="border border-black/15 bg-white/60 px-2 py-1 text-[11px] font-medium text-foreground transition hover:border-[#c8102e] hover:bg-[#c8102e] hover:text-white dark:border-white/15 dark:bg-white/5"
                      >
                        {t.symbol}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-1 border-t border-black/15 pt-2 dark:border-white/15">
                    <input
                      type="text"
                      placeholder="CUSTOM TICKER..."
                      value={customSymbolInput}
                      onChange={(e) => setCustomSymbolInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && customSymbolInput.trim()) {
                          setPinnedSymbol(customSymbolInput.trim());
                          setCustomSymbolInput("");
                          setShowSymbolPicker(false);
                        }
                      }}
                      className="h-7 flex-1 border border-black/15 bg-white px-2 font-mono text-xs outline-none dark:border-white/15 dark:bg-neutral-900"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (customSymbolInput.trim()) {
                          setPinnedSymbol(customSymbolInput.trim());
                          setCustomSymbolInput("");
                          setShowSymbolPicker(false);
                        }
                      }}
                      className="h-7 bg-[#111111] px-2 font-mono text-[10px] uppercase tracking-wider text-[#f3f1ed] hover:bg-[#c8102e] dark:bg-white dark:text-black dark:hover:bg-[#c8102e] dark:hover:text-white"
                    >
                      SET
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="h-4 w-px bg-black/15 dark:bg-white/15 mx-1" />

          <button
            type="button"
            onClick={handleExportTranscript}
            disabled={messages.length === 0}
            className="flex items-center gap-1.5 border border-black/15 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-black/60 transition hover:border-[#c8102e] hover:text-[#c8102e] disabled:opacity-40 dark:border-white/15 dark:text-white/60"
            title="Export conversation"
          >
            <Download className="size-3.5" />
            <span className="hidden sm:inline">EXPORT</span>
          </button>

          <button
            type="button"
            onClick={handleResetSession}
            disabled={messages.length === 0}
            className="flex items-center gap-1.5 border border-black/15 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-black/60 transition hover:border-[#c8102e] hover:text-[#c8102e] disabled:opacity-40 dark:border-white/15 dark:text-white/60"
            title="Start new session"
          >
            <RotateCcw className="size-3.5" />
            <span className="hidden sm:inline">RESET</span>
          </button>
        </div>
      </div>

      {/* Main Chat / Launchpad */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          {messages.length === 0 ? (
            <div className="py-6 sm:py-10">
              <div className="mx-auto max-w-2xl text-center">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c8102e]">
                  01 / OPERATING COPILOT
                </p>
                <h2 className="mt-4 text-3xl font-light tracking-[-0.05em] text-foreground sm:text-4xl">
                  Astra Terminal.
                </h2>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-black/60 dark:text-white/60">
                  Direct intelligence over connected venues: fundamental screening, quantitative comparison, candlestick structure, and live performance auditing.
                </p>

                {/* Hot Watchlist Tickers */}
                <div className="mt-8 flex flex-wrap items-center justify-center gap-2 font-mono">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-black/40 dark:text-white/40 mr-1">
                    Watchlist:
                  </span>
                  {HOT_TICKERS.map((t) => (
                    <button
                      key={t.symbol}
                      type="button"
                      onClick={() => {
                        setPinnedSymbol(t.symbol);
                        setInput(`Analyze current trend and fundamental read for ${t.symbol}`);
                      }}
                      className={cn(
                        "border px-2.5 py-1 text-[11px] font-medium transition",
                        pinnedSymbol === t.symbol
                          ? "border-[#c8102e] bg-[#c8102e] text-white"
                          : "border-black/15 bg-white/40 text-foreground hover:border-[#c8102e] hover:text-[#c8102e] dark:border-white/15 dark:bg-white/5"
                      )}
                    >
                      {t.symbol}
                    </button>
                  ))}
                </div>
              </div>

              {/* Starter Categories Tabs */}
              <div className="mt-12">
                <div className="mb-6 flex flex-wrap items-center justify-center gap-2 border-b border-black/15 pb-4 dark:border-white/15 font-mono">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={cn(
                        "px-3 py-1 text-xs uppercase tracking-[0.14em] transition border",
                        selectedCategory === cat
                          ? "border-black bg-[#111111] text-white dark:border-white dark:bg-white dark:text-black"
                          : "border-transparent text-black/50 hover:border-black/20 hover:text-black dark:text-white/50 dark:hover:border-white/20 dark:hover:text-white"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Swiss Grid of Starter Cards */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 font-mono">
                  {filteredPrompts.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendPrompt(item.prompt)}
                      className="group flex flex-col justify-between border border-black/15 bg-white/40 p-4 text-left shadow-[2px_2px_0_rgba(0,0,0,0.06)] transition hover:-translate-y-0.5 hover:border-[#c8102e] hover:shadow-[4px_4px_0_#c8102e] dark:border-white/15 dark:bg-white/[0.02]"
                    >
                      <div>
                        <div className="flex items-center justify-between text-black/40 dark:text-white/40 text-[10px] uppercase tracking-[0.16em]">
                          <span>{`${item.code} //`}</span>
                          <span>{item.category.split(" ")[0]}</span>
                        </div>
                        <h4 className="mt-3 font-sans text-sm font-medium tracking-tight text-foreground group-hover:text-[#c8102e]">
                          {item.title}
                        </h4>
                        <p className="mt-1 font-sans text-xs leading-relaxed text-black/60 dark:text-white/60">
                          {item.desc}
                        </p>
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-black/10 pt-2 text-[10px] uppercase tracking-wider text-black/40 group-hover:text-[#c8102e] dark:border-white/10">
                        <span>EXECUTE</span>
                        <ArrowRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pb-4">
              {messages.map((m) => (
                <SwissMessageRow key={m.id} message={m} onCopyText={handleCopyText} />
              ))}

              {isStreaming && (
                <div className="flex items-center gap-2 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-black/50 dark:text-white/50">
                  <span className="size-1.5 bg-[#c8102e] animate-ping" />
                  <span>Thinking...</span>
                </div>
              )}

              {error && (
                <div className="border border-[#c8102e] bg-[#c8102e]/10 p-3 font-mono text-xs text-[#c8102e]">
                  <p className="font-semibold uppercase tracking-wider">Execution Error //</p>
                  <p className="mt-1">{error.message || "Failed to process query. Retry."}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Swiss Prompt Composer */}
      <div className="border-t border-black/15 bg-black/5 p-3 sm:p-4 dark:border-white/15 dark:bg-white/5">
        <form onSubmit={handleFormSubmit} className="mx-auto max-w-4xl">
          {pinnedSymbol && (
            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
              <span className="text-black/40 dark:text-white/40">Context:</span>
              <button
                type="button"
                onClick={() => setInput(`Compare ${pinnedSymbol} fundamentals with peers`)}
                className="border border-black/15 bg-white px-2 py-0.5 text-black hover:border-[#c8102e] hover:text-[#c8102e] dark:border-white/15 dark:bg-neutral-900 dark:text-white"
              >
                PEERS
              </button>
              <button
                type="button"
                onClick={() => setInput(`Show daily candlestick chart and indicators for ${pinnedSymbol}`)}
                className="border border-black/15 bg-white px-2 py-0.5 text-black hover:border-[#c8102e] hover:text-[#c8102e] dark:border-white/15 dark:bg-neutral-900 dark:text-white"
              >
                CHART
              </button>
              <button
                type="button"
                onClick={() => setInput(`Recent catalysts and sentiment for ${pinnedSymbol}`)}
                className="border border-black/15 bg-white px-2 py-0.5 text-black hover:border-[#c8102e] hover:text-[#c8102e] dark:border-white/15 dark:bg-neutral-900 dark:text-white"
              >
                NEWS
              </button>
            </div>
          )}

          <div className="relative flex items-end gap-2 border border-black/20 bg-white p-2.5 shadow-[3px_3px_0_rgba(0,0,0,0.06)] focus-within:border-[#111111] dark:border-white/20 dark:bg-[#111111] dark:focus-within:border-white">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={pinnedSymbol ? `Ask about ${pinnedSymbol}...` : "Ask about a stock, screen the market, compare fundamentals, or check my trade performance..."}
              disabled={isStreaming}
              className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1 font-sans text-sm leading-relaxed outline-none placeholder:text-black/40 dark:placeholder:text-white/40 disabled:opacity-50"
            />

            <div className="flex items-center gap-1.5 pb-0.5 pr-0.5 font-mono">
              {input.trim() && (
                <button
                  type="button"
                  onClick={() => setInput("")}
                  className="p-1.5 text-black/40 hover:text-[#c8102e] dark:text-white/40"
                  title="Clear"
                >
                  <X className="size-4" />
                </button>
              )}

              {isStreaming ? (
                <button
                  type="button"
                  onClick={() => stop?.()}
                  className="bg-[#c8102e] p-2 text-white hover:bg-[#a00d25]"
                  aria-label="Stop"
                >
                  <Square className="size-4 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-xs uppercase tracking-wider transition",
                    input.trim()
                      ? "bg-[#111111] text-[#f3f1ed] hover:bg-[#c8102e] dark:bg-white dark:text-black dark:hover:bg-[#c8102e] dark:hover:text-white"
                      : "bg-black/5 text-black/30 dark:bg-white/5 dark:text-white/30"
                  )}
                  aria-label="Send"
                >
                  <span>RUN</span>
                  <ArrowRight className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between px-1 font-mono text-[9px] uppercase tracking-[0.16em] text-black/40 dark:text-white/40">
            <div className="flex items-center gap-3">
              <span>ENTER ↵ TO EXECUTE</span>
              <span>SHIFT + ENTER FOR NEWLINE</span>
            </div>
            <span>ASTRA // v2.0</span>
          </div>
        </form>
      </div>
    </div>
  );
}
