import { cn } from "@/lib/utils";
import type { PerformanceInsight } from "@/lib/performance/queries";

export function InsightsPanel({ insights }: { insights: PerformanceInsight[] }) {
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">Insights & alerts</h2>
      <p className="mb-3 text-sm text-muted-foreground">Automated diagnostics on this period&rsquo;s trading behavior.</p>
      <div className="surface p-4">
        {insights.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No insights available yet. Trade more to unlock performance insights.
          </p>
        ) : (
          <div className="space-y-2">
            {insights.map((insight, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-lg border-l-2 bg-muted/20 p-3",
                  insight.severity === "warning" ? "border-l-negative" : "border-l-muted-foreground",
                )}
              >
                <p className="text-sm font-medium">{insight.title}</p>
                <p className="text-xs text-muted-foreground">{insight.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
