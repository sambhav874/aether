import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold">This page doesn&apos;t exist</h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        The link may be out of date, or the workspace it pointed at is no longer
        one you have access to.
      </p>
      <Button render={<Link href="/dashboard" />}>Back to dashboard</Button>
    </main>
  );
}
