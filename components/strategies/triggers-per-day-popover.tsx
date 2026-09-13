"use client";

import * as React from "react";
import { Infinity as InfinityIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { setMaxTriggersPerDay } from "@/lib/strategies/detail-actions";
import { useToast } from "@/components/providers/toast-provider";

export function TriggersPerDayPopover({
  strategyId,
  maxTriggersPerDay,
  triggersToday,
  canEdit,
}: {
  strategyId: string;
  maxTriggersPerDay: number | null;
  triggersToday: number;
  canEdit: boolean;
}) {
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(maxTriggersPerDay?.toString() ?? "");
  const [pending, startTransition] = React.useTransition();

  function handleSave() {
    const n = value.trim() ? Number(value) : null;
    startTransition(async () => {
      toast.report(await setMaxTriggersPerDay(strategyId, n), "Daily cap updated");
      setOpen(false);
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          />
        }
      >
        {maxTriggersPerDay === null ? (
          <InfinityIcon className="size-3" />
        ) : (
          <span className="tabular-figures">
            {triggersToday}/{maxTriggersPerDay}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent>
        <p className="text-sm font-medium">Max triggers / day</p>
        <p className="mb-2 text-xs text-muted-foreground">
          Hard cap on signals accepted per calendar day. Leave blank for unlimited.
        </p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            placeholder="Unlimited"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={!canEdit}
            className="h-7 flex-1 text-xs"
          />
          <span className="text-xs text-muted-foreground">/ day</span>
        </div>
        {canEdit && (
          <div className="mt-2 flex items-center justify-between">
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setValue("")}>
              Set to unlimited
            </button>
            <Button size="sm" onClick={handleSave} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">used today: {triggersToday}</p>
      </PopoverContent>
    </Popover>
  );
}
