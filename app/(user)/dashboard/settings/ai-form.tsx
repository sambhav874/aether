"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { saveModelPref, resetModelPref, type ModelPrefRow } from "@/lib/ai/settings/actions";
import type { AiProviderName } from "@/lib/ai/provider/models";
import type { MODEL_CATALOG } from "@/lib/ai/provider/models";

const LANE_LABELS: Record<ModelPrefRow["lane"], { label: string; description: string }> = {
  routing: { label: "Routing", description: "Symbol disambiguation, first-token hop — picks the tool, not the answer." },
  main_loop: { label: "Main copilot", description: "The default tool loop — answers most questions in the copilot chat." },
  deep_synthesis: { label: "Deep research", description: "Synthesis step for multi-source deep-dive queries." },
  sub_agent: { label: "Deep research sub-agents", description: "Parallel briefs (fundamentals/technicals/news) inside a deep dive." },
  fallback: { label: "Fallback", description: "Used automatically when your chosen lane's provider errors or times out." },
};

function providerLabel(p: AiProviderName): string {
  return p === "groq" ? "Groq" : p === "google" ? "Google" : "OpenAI";
}

export function AiForm({
  initialRows,
  catalog,
  availableProviders,
}: {
  initialRows: ModelPrefRow[];
  catalog: typeof MODEL_CATALOG;
  availableProviders: AiProviderName[];
}) {
  const [rows, setRows] = React.useState(initialRows);
  const [pendingLane, setPendingLane] = React.useState<ModelPrefRow["lane"] | null>(null);

  const options = availableProviders.flatMap((provider) => catalog[provider].map((entry) => ({ provider, ...entry })));

  function handleChange(lane: ModelPrefRow["lane"], value: string) {
    const [provider, model] = value.split("::") as [AiProviderName, string];
    setRows((prev) => prev.map((r) => (r.lane === lane ? { ...r, provider, model, isOverride: true } : r)));
    setPendingLane(lane);
    void saveModelPref(lane, provider, model).finally(() => setPendingLane(null));
  }

  function handleReset(lane: ModelPrefRow["lane"]) {
    const original = initialRows.find((r) => r.lane === lane);
    setPendingLane(lane);
    void resetModelPref(lane).then(() => {
      if (original) setRows((prev) => prev.map((r) => (r.lane === lane ? { ...r, ...original } : r)));
      setPendingLane(null);
    });
  }

  if (options.length === 0) {
    return <p className="max-w-md text-sm text-muted-foreground">No AI provider keys are configured for this deployment yet. Once GROQ_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or OPENAI_API_KEY are set, models will show up here to choose from.</p>;
  }

  return (
    <div className="max-w-lg space-y-6">
      <p className="text-xs text-muted-foreground">
        Each lane defaults to the platform&apos;s pick — only providers this deployment currently has a key for are offered. Changes apply to your own account only.
      </p>
      {rows.map((row) => (
        <div key={row.lane} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor={`lane-${row.lane}`}>{LANE_LABELS[row.lane].label}</Label>
            {row.isOverride && (
              <button type="button" onClick={() => handleReset(row.lane)} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" disabled={pendingLane === row.lane}>
                Reset to default
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{LANE_LABELS[row.lane].description}</p>
          <select
            id={`lane-${row.lane}`}
            value={`${row.provider}::${row.model}`}
            onChange={(e) => handleChange(row.lane, e.target.value)}
            disabled={pendingLane === row.lane}
            className="h-9 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            {options.map((opt) => (
              <option key={`${opt.provider}::${opt.model}`} value={`${opt.provider}::${opt.model}`}>
                {providerLabel(opt.provider)} — {opt.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">{catalog[row.provider].find((m) => m.model === row.model)?.note}</p>
        </div>
      ))}
    </div>
  );
}
