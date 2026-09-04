"use client";

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Check, Copy } from "lucide-react";

function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  const isBlock = /language-/.test(className ?? "");
  const text = String(children).replace(/\n$/, "");

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isBlock) {
    const lang = (className?.replace(/language-/, "") || "text").toLowerCase();
    return (
      <div className="group relative my-3 overflow-hidden rounded-lg border border-border/70 bg-muted/40 dark:bg-black/40">
        <div className="flex items-center justify-between border-b border-border/50 bg-muted/60 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground dark:bg-neutral-900/60">
          <span>{lang}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:bg-muted hover:text-foreground"
            title="Copy code"
          >
            {copied ? (
              <>
                <Check className="size-3 text-emerald-500" />
                <span className="text-emerald-500">Copied</span>
              </>
            ) : (
              <>
                <Copy className="size-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
        <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-foreground">
          <code>{children}</code>
        </pre>
      </div>
    );
  }

  return (
    <code className="rounded border border-border/50 bg-muted/50 px-1.5 py-0.5 font-mono text-[0.85em] font-medium text-foreground dark:bg-neutral-900/80">
      {children}
    </code>
  );
}

const components: Components = {
  p: ({ children }) => <p className="leading-relaxed text-foreground/90 [&:not(:first-child)]:mt-2.5">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic text-foreground/90">{children}</em>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-[#c8102e] underline underline-offset-4 transition hover:text-[#9e0c24] dark:text-[#ff8a9c] dark:hover:text-[#ffaab8]"
    >
      {children}
    </a>
  ),
  img: () => null,
  ul: ({ children }) => <ul className="my-2.5 ml-4 list-disc space-y-1 text-foreground/90 marker:text-muted-foreground">{children}</ul>,
  ol: ({ children }) => <ol className="my-2.5 ml-4 list-decimal space-y-1 text-foreground/90 marker:text-muted-foreground">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-3.5 text-sm font-semibold tracking-tight text-foreground first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground first:mt-0">{children}</h4>,
  hr: () => <hr className="my-3.5 border-border/60" />,
  code: ({ children, className }) => <CodeBlock className={className}>{children}</CodeBlock>,
  pre: ({ children }) => <>{children}</>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-[#c8102e] bg-muted/20 py-1 pl-3.5 pr-2 text-xs italic leading-relaxed text-muted-foreground dark:bg-neutral-900/40">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-border/70 bg-card/60 shadow-xs">
      <table className="w-full text-left text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-border/70 bg-muted/60 font-mono text-[11px] uppercase tracking-wider text-muted-foreground dark:bg-neutral-900/60">
      {children}
    </thead>
  ),
  tr: ({ children }) => <tr className="border-b border-border/40 transition hover:bg-muted/30 last:border-0">{children}</tr>,
  th: ({ children }) => <th className="whitespace-nowrap px-3 py-2 font-medium">{children}</th>,
  td: ({ children }) => <td className="whitespace-nowrap px-3 py-2 text-foreground/90">{children}</td>,
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-[13.5px] leading-relaxed text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
