"use client";

import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const POSITION_COLUMNS = [
  "Symbol",
  "Side",
  "Entry → Exit",
  "Quantity",
  "Status",
  "Close reason",
  "Pnl",
  "Points",
  "Rr",
  "Sl",
  "Strategy",
  "Account",
  "Since",
  "TiT",
] as const;

export type PositionColumn = (typeof POSITION_COLUMNS)[number];

// Matches the source doc: every column checked by default except "Since".
export const DEFAULT_VISIBLE_COLUMNS: Record<PositionColumn, boolean> = Object.fromEntries(
  POSITION_COLUMNS.map((c) => [c, c !== "Since"]),
) as Record<PositionColumn, boolean>;

export function ColumnVisibilityMenu({
  visible,
  onChange,
}: {
  visible: Record<PositionColumn, boolean>;
  onChange: (visible: Record<PositionColumn, boolean>) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <Columns3 className="size-4" />
        Columns
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Visible columns
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {POSITION_COLUMNS.map((column) => (
          <DropdownMenuCheckboxItem
            key={column}
            checked={visible[column]}
            onCheckedChange={(checked) => onChange({ ...visible, [column]: checked })}
          >
            {column}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
