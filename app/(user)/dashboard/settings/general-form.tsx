"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateWorkspaceGeneral, type GeneralSettingsState } from "@/lib/settings/actions";

const initialState: GeneralSettingsState = {};

export function GeneralForm({ workspace }: { workspace: { name: string; slug: string } }) {
  const [state, formAction, pending] = useActionState(updateWorkspaceGeneral, initialState);

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="workspace-name">Workspace name</Label>
        <Input id="workspace-name" name="name" defaultValue={workspace.name} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="workspace-slug">Slug</Label>
        <Input id="workspace-slug" value={workspace.slug} disabled />
        <p className="text-xs text-muted-foreground">Slug changes aren&rsquo;t supported yet.</p>
      </div>
      {state.error && <p className="text-sm text-negative">{state.error}</p>}
      {state.success && <p className="text-sm text-positive">Workspace updated.</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
