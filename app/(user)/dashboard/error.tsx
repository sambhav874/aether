"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Route-level boundary for everything under /dashboard. Without this a single
 * bad value in a positions or P&L render takes the whole dashboard to Next's
 * default error page with no way back.
 *
 * Deliberately says nothing about trading state: this boundary fires on a
 * render failure, which tells us nothing about whether an order was placed.
 * Claiming otherwise in either direction would be worse than silence.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("[dashboard] render error —", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-lg font-semibold">This view failed to load</h2>
      <p className="max-w-prose text-sm text-muted-foreground">
        Your positions and strategies are unaffected — this is a display error.
        Try again, and check the Strategies page directly if it persists.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={() => router.push("/dashboard")}>
          Back to overview
        </Button>
      </div>
      {error.digest ? (
        <p className="font-mono text-xs text-muted-foreground">Reference {error.digest}</p>
      ) : null}
    </div>
  );
}
