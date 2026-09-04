import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/trading-module/empty-state";
import { getAuditLog } from "@/lib/settings/actions";

function formatTime(date: Date) {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function AuditLogPanel() {
  const entries = await getAuditLog();

  if (entries.length === 0) {
    return (
      <EmptyState
        title="No activity yet"
        description="Actions like creating strategies, connecting brokers, and managing members show up here."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Time</th>
            <th className="px-3 py-2 font-medium">Actor</th>
            <th className="px-3 py-2 font-medium">Action</th>
            <th className="px-3 py-2 font-medium">Summary</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b last:border-0">
              <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                {formatTime(entry.occurredAt)}
              </td>
              <td className="whitespace-nowrap px-3 py-2">{entry.actorName ?? "System"}</td>
              <td className="px-3 py-2 font-mono text-xs">{entry.action}</td>
              <td className="px-3 py-2">{entry.summary}</td>
              <td className="px-3 py-2">
                <Badge variant={entry.status === "success" ? "secondary" : "destructive"}>
                  {entry.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
