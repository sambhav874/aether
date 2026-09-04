"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { useAppearance } from "@/components/providers/appearance-provider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AppearanceForm() {
  const { theme, setTheme } = useTheme();
  const { density, motion, numberFormat, setDensity, setMotion, setNumberFormat } =
    useAppearance();

  // next-themes only knows the real theme after mount (it can't know the
  // client's `system` preference during SSR) — render a placeholder until
  // then instead of letting the mismatched value hit the DOM at hydration.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <div className="max-w-md space-y-6">
      <div className="space-y-2">
        <Label>Theme</Label>
        {mounted ? (
          <Select
            value={theme}
            onValueChange={(value) => value && setTheme(value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">Match system</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Skeleton className="h-9 w-32" />
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="compact-density">Compact density</Label>
          <p className="text-sm text-muted-foreground">Tighter table row height.</p>
        </div>
        <Switch
          id="compact-density"
          checked={density === "compact"}
          onCheckedChange={(checked) => setDensity(checked ? "compact" : "comfortable")}
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="reduced-motion">Reduced motion</Label>
          <p className="text-sm text-muted-foreground">Minimize animations and transitions.</p>
        </div>
        <Switch
          id="reduced-motion"
          checked={motion === "reduced"}
          onCheckedChange={(checked) => setMotion(checked ? "reduced" : "system")}
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="tabular-numbers">Tabular numbers</Label>
          <p className="text-sm text-muted-foreground">
            Fixed-width digits for prices and figures.
          </p>
        </div>
        <Switch
          id="tabular-numbers"
          checked={numberFormat === "tabular"}
          onCheckedChange={(checked) => setNumberFormat(checked ? "tabular" : "default")}
        />
      </div>
    </div>
  );
}
