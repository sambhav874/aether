"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { updateStrategyParameters } from "@/lib/strategies/detail-actions";

export function ParametersDialog({
  strategyId,
  strategyName,
  initialCoolDown,
  initialConfig,
  open,
  onOpenChange,
}: {
  strategyId: string;
  strategyName: string;
  initialCoolDown: number | null;
  initialConfig: Record<string, string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [coolDown, setCoolDown] = React.useState(initialCoolDown?.toString() ?? "");
  const [fields, setFields] = React.useState<{ key: string; value: string }[]>(
    Object.entries(initialConfig).map(([key, value]) => ({ key, value })),
  );
  const [newFieldName, setNewFieldName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function addField() {
    const name = newFieldName.trim();
    if (!name) return;
    if (fields.some((f) => f.key === name)) {
      setError(`Field "${name}" already exists.`);
      return;
    }
    setFields((prev) => [...prev, { key: name, value: "" }]);
    setNewFieldName("");
    setError(null);
  }

  function handleSave() {
    const coolDownValue = coolDown.trim() ? Number(coolDown) : null;
    if (coolDownValue !== null && (!Number.isFinite(coolDownValue) || coolDownValue < 0)) {
      setError("Cooldown must be a non-negative number of seconds.");
      return;
    }
    const config = Object.fromEntries(fields.filter((f) => f.key.trim()).map((f) => [f.key, f.value]));
    startTransition(async () => {
      const result = await updateStrategyParameters(strategyId, { coolDownPeriod: coolDownValue, config });
      if (result.error) setError(result.error);
      else onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Parameters — {strategyName}</DialogTitle>
          <DialogDescription>Cooldown and custom configuration fields.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label className="text-xs">Cooldown period (seconds)</Label>
          <Input
            type="number"
            min={0}
            placeholder="No cooldown"
            value={coolDown}
            onChange={(e) => setCoolDown(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            How long the strategy waits after its last trigger before it can trigger again.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Configuration</Label>
          {fields.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              No configuration fields yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {fields.map((field, i) => (
                <div key={field.key} className="flex items-center gap-1.5">
                  <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">{field.key}</span>
                  <Input
                    value={field.value}
                    onChange={(e) =>
                      setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, value: e.target.value } : f)))
                    }
                    className="h-7 flex-1 text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setFields((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1.5 pt-1">
            <Input
              placeholder="Field name"
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addField();
                }
              }}
              className="h-7 flex-1 text-xs"
            />
            <Button variant="outline" size="icon-sm" onClick={addField}>
              <Plus className="size-3.5" />
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-negative">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Saving…" : "Save configuration"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
