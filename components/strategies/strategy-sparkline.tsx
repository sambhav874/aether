"use client";

import { Bar, BarChart, ResponsiveContainer } from "recharts";

export function StrategySparkline({ data }: { data: { date: string; count: number }[] }) {
  if (data.length === 0) {
    return <span className="text-xs text-muted-foreground">No signals in last 7d</span>;
  }

  return (
    <div className="h-6 w-20">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <Bar dataKey="count" fill="var(--positive)" radius={1} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
