"use client";

import * as React from "react";
import { authClient, useSession } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export function ProfileForm() {
  const { data: session, isPending, refetch } = useSession();
  const [status, setStatus] = React.useState<{ error?: string; success?: boolean }>({});
  const [pending, startTransition] = React.useTransition();

  if (isPending) {
    return (
      <div className="max-w-md space-y-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({});
    const name = new FormData(event.currentTarget).get("name");
    startTransition(async () => {
      const result = await authClient.updateUser({ name: String(name) });
      if (result.error) {
        setStatus({ error: result.error.message ?? "Could not update profile." });
      } else {
        setStatus({ success: true });
        refetch();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="profile-name">Name</Label>
        <Input id="profile-name" name="name" key={session?.user.name} defaultValue={session?.user.name} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-email">Email</Label>
        <Input id="profile-email" value={session?.user.email ?? ""} disabled />
        <p className="text-xs text-muted-foreground">
          Changing your email requires re-verification — not available yet.
        </p>
      </div>
      {status.error && <p className="text-sm text-negative">{status.error}</p>}
      {status.success && <p className="text-sm text-positive">Profile updated.</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
