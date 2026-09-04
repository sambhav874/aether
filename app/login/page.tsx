"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  const [mode, setMode] = React.useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const result =
      mode === "sign-in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name });

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Something went wrong.");
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden p-6">
      <div
        className="pointer-events-none absolute top-[-20%] left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full opacity-[0.12] blur-3xl"
        style={{ background: "var(--brand)" }}
      />
      <div className="relative w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center font-mono">
          <div className="mx-auto mb-3 flex size-9 items-center justify-center bg-[#c8102e] text-xs font-bold text-[#f3f1ed]">
            A
          </div>
          <h1 className="font-sans text-2xl font-light tracking-[-0.04em]">Aether</h1>
          <p className="text-xs uppercase tracking-[0.16em] text-black/50 dark:text-white/50">
            {mode === "sign-in" ? "01 / Sign in to workspace" : "01 / Create workspace account"}
          </p>
        </div>

        <div className="border border-black/15 bg-white p-6 shadow-[6px_6px_0_#111111] dark:border-white/15 dark:bg-[#181818] dark:shadow-[6px_6px_0_#c8102e]">
          <form onSubmit={onSubmit} className="space-y-4 font-mono text-xs">
            {mode === "sign-up" && (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-[10px] uppercase tracking-wider text-black/60 dark:text-white/60">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-none border border-black/20 bg-transparent font-sans text-xs dark:border-white/20"
                  required
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[10px] uppercase tracking-wider text-black/60 dark:text-white/60">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-none border border-black/20 bg-transparent font-sans text-xs dark:border-white/20"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[10px] uppercase tracking-wider text-black/60 dark:text-white/60">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-none border border-black/20 bg-transparent font-sans text-xs dark:border-white/20"
                required
                minLength={8}
              />
            </div>

            {error && <p className="text-xs text-[#c8102e]">{error}</p>}

            <button
              type="submit"
              className="mt-2 flex w-full items-center justify-center bg-[#111111] py-2.5 font-mono text-xs uppercase tracking-[0.16em] text-[#f3f1ed] transition hover:bg-[#c8102e] disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-[#c8102e] dark:hover:text-white"
              disabled={pending}
            >
              {pending ? "PLEASE WAIT…" : mode === "sign-in" ? "SIGN IN ↵" : "CREATE ACCOUNT ↵"}
            </button>
          </form>
        </div>

        <button
          type="button"
          className="w-full text-center font-mono text-xs uppercase tracking-wider text-black/50 hover:text-[#c8102e] dark:text-white/50 dark:hover:text-[#c8102e]"
          onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
        >
          {mode === "sign-in"
            ? "Need an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense>
      <LoginForm />
    </React.Suspense>
  );
}
