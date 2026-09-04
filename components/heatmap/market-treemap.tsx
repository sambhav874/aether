"use client";

import { ResponsiveContainer, Treemap, Tooltip } from "recharts";
import type { TreemapNode } from "recharts/types/chart/Treemap";
import type { MarketHeatmapEntry } from "@/lib/heatmap/types";

function changeColor(changePct: number | null): string {
  if (changePct === null) return "var(--muted)";
  const clamped = Math.max(-8, Math.min(8, changePct));
  const intensity = Math.abs(clamped) / 8;
  return changePct >= 0
    ? `color-mix(in oklch, var(--positive) ${20 + intensity * 60}%, var(--card))`
    : `color-mix(in oklch, var(--negative) ${20 + intensity * 60}%, var(--card))`;
}

function CellContent(props: TreemapNode) {
  const { x, y, width, height, name } = props;
  const changePct = (props.changePct as number | null) ?? null;
  if (width < 2 || height < 2) return null;

  const showText = width > 44 && height > 28;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={changeColor(changePct)}
        stroke="var(--border)"
        strokeWidth={1}
      />
      {showText && (
        <>
          <text x={x + 6} y={y + 16} fontSize={12} fontWeight={600} fill="var(--foreground)">
            {name}
          </text>
          {changePct !== null && (
            <text x={x + 6} y={y + 32} fontSize={11} fill="var(--foreground)" opacity={0.85}>
              {changePct >= 0 ? "+" : ""}
              {changePct.toFixed(1)}%
            </text>
          )}
        </>
      )}
    </g>
  );
}

export function MarketTreemap({ entries }: { entries: MarketHeatmapEntry[] }) {
  const data = entries.map((e) => ({
    name: e.symbol,
    value: e.value,
    changePct: e.changePct,
    fullName: e.name,
    price: e.price,
  }));

  return (
    <div className="h-[480px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={data}
          dataKey="value"
          nameKey="name"
          aspectRatio={4 / 3}
          stroke="var(--border)"
          content={(props) => <CellContent {...props} />}
          isAnimationActive={false}
        >
          <Tooltip
            content={({ payload }) => {
              const item = payload?.[0]?.payload as
                | { name: string; fullName: string; price: number; changePct: number | null }
                | undefined;
              if (!item) return null;
              return (
                <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                  <p className="font-semibold">
                    {item.fullName} ({item.name})
                  </p>
                  <p className="tabular-figures text-muted-foreground">
                    {item.price.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                  </p>
                  {item.changePct !== null && (
                    <p className={item.changePct >= 0 ? "text-positive" : "text-negative"}>
                      {item.changePct >= 0 ? "+" : ""}
                      {item.changePct.toFixed(2)}%
                    </p>
                  )}
                </div>
              );
            }}
          />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
}
