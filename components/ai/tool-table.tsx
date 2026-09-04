"use client";

import * as React from "react";
import { Check, Copy, Table as TableIcon } from "lucide-react";
import type { RenderTableInput } from "@/lib/ai/tools/render";

function formatCellValue(val: unknown) {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "number") {
    return Number.isInteger(val) ? val.toLocaleString() : val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(val);
}

export function ToolTable({ input }: { input: RenderTableInput }) {
  const { columns, rows, caption } = input;
  const [copied, setCopied] = React.useState(false);
  const [filter, setFilter] = React.useState("");

  if (columns.length === 0 || rows.length === 0) return null;

  const handleCopyCsv = () => {
    const headers = columns.map((c) => `"${c.label}${c.unit ? ` (${c.unit})` : ""}"`).join(",");
    const rowLines = rows.map((row) => columns.map((c) => `"${row[c.key] ?? ""}"`).join(","));
    const csv = [headers, ...rowLines].join("\n");
    navigator.clipboard.writeText(csv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredRows = filter.trim()
    ? rows.filter((row) =>
        Object.values(row).some((val) => String(val).toLowerCase().includes(filter.toLowerCase()))
      )
    : rows;

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border/80 bg-card/90 shadow-xs backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-3.5 py-2">
        <div className="flex items-center gap-2">
          <TableIcon className="size-3.5 text-[#c8102e]" />
          <span className="font-mono text-xs font-medium text-foreground">
            {caption || "Tabular Analysis"}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {rows.length} {rows.length === 1 ? "row" : "rows"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {rows.length > 5 && (
            <input
              type="text"
              placeholder="Filter..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-6 w-24 rounded border border-border/60 bg-background px-2 text-[11px] outline-none focus:w-32 focus:border-ring transition-all"
            />
          )}
          <button
            type="button"
            onClick={handleCopyCsv}
            className="inline-flex items-center gap-1 rounded border border-border/50 bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            title="Copy as CSV"
          >
            {copied ? (
              <>
                <Check className="size-3 text-emerald-500" />
                <span className="text-emerald-500">Copied CSV</span>
              </>
            ) : (
              <>
                <Copy className="size-3" />
                <span>Export CSV</span>
              </>
            )}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {columns.map((c) => (
                <th key={c.key} className="whitespace-nowrap px-3.5 py-2 font-medium">
                  {c.label}
                  {c.unit ? <span className="ml-1 text-[10px] lowercase text-muted-foreground/80">({c.unit})</span> : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 font-mono">
            {filteredRows.map((row, i) => (
              <tr key={i} className="transition-colors hover:bg-muted/30">
                {columns.map((c) => {
                  const val = row[c.key];
                  const isNumeric = typeof val === "number";
                  return (
                    <td
                      key={c.key}
                      className={`whitespace-nowrap px-3.5 py-2.5 text-[12px] text-foreground/90 ${
                        isNumeric ? "tabular-nums" : ""
                      }`}
                    >
                      {formatCellValue(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
