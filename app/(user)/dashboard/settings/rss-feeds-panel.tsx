"use client";

import * as React from "react";
import { Trash2, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { addUserRssFeed, toggleUserRssFeed, deleteUserRssFeed, testUserRssFeed } from "@/lib/rss-feeds/actions";
import type { UserRssFeed, FeedTestResult } from "@/lib/rss-feeds/actions";

function FeedRow({ feed }: { feed: UserRssFeed }) {
  const [pending, startTransition] = React.useTransition();
  const [testResult, setTestResult] = React.useState<FeedTestResult | null>(null);

  return (
    <div className="rounded-md border px-3 py-2 text-sm">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{feed.label}</p>
          <p className="truncate text-xs text-muted-foreground">{feed.url}</p>
        </div>
        <Switch
          checked={feed.active}
          disabled={pending}
          onCheckedChange={() => startTransition(() => toggleUserRssFeed(feed.id))}
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          title="Test feed"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setTestResult(null);
              setTestResult(await testUserRssFeed(feed.url));
            })
          }
        >
          <FlaskConical className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={pending}
          onClick={() => startTransition(() => deleteUserRssFeed(feed.id))}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      {testResult && (
        <p className={`mt-1 text-xs ${testResult.ok ? "text-muted-foreground" : "text-negative"}`}>
          {testResult.ok ? `Fetched ok — ${testResult.itemCount} items found.` : `Failed: ${testResult.error}`}
        </p>
      )}
    </div>
  );
}

export function RssFeedsPanel({ feeds }: { feeds: UserRssFeed[] }) {
  const [pending, startTransition] = React.useTransition();
  const [addError, setAddError] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const label = String(form.get("label") ?? "");
    const url = String(form.get("url") ?? "");
    startTransition(async () => {
      const result = await addUserRssFeed(label, url);
      setAddError(result.error ?? null);
      if (!result.error) formRef.current?.reset();
    });
  }

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <h3 className="text-sm font-medium">RSS feeds</h3>
        <p className="text-xs text-muted-foreground">
          Add your own feed URLs to pull into your personal news stream, on top of the built-in
          sources.
        </p>
      </div>

      {feeds.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          No custom feeds yet.
        </p>
      ) : (
        <div className="space-y-2">
          {feeds.map((feed) => (
            <FeedRow key={feed.id} feed={feed} />
          ))}
        </div>
      )}

      <form ref={formRef} className="flex items-end gap-2" onSubmit={handleSubmit}>
        <div className="min-w-0 flex-1 space-y-1">
          <Label className="text-xs">Label</Label>
          <Input name="label" placeholder="My Feed" required />
        </div>
        <div className="min-w-0 flex-[2] space-y-1">
          <Label className="text-xs">Feed URL</Label>
          <Input name="url" placeholder="https://example.com/rss.xml" required />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          Add
        </Button>
      </form>
      {addError && <p className="text-xs text-negative">{addError}</p>}
    </div>
  );
}
