"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

/**
 * Minimal toast surface, no dependency.
 *
 * Every server action in this app returns `{ error }` on failure, and almost
 * none of the callers rendered it — a rejected action looked exactly like a
 * successful one, which is the worst possible outcome for a form that
 * configures order sizing. Adding runtime validation made that more likely to
 * fire, not less, so the failures need somewhere to go.
 */

type Toast = { id: number; kind: "error" | "success"; message: string };
type ToastApi = {
  /** Renders `result.error` if present; returns true when the action succeeded. */
  report: (result: { error?: string } | void | undefined, successMessage?: string) => boolean;
  error: (message: string) => void;
  success: (message: string) => void;
};

const ToastContext = React.createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(0);

  const push = React.useCallback((kind: Toast["kind"], message: string) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, kind, message }]);
    // Errors linger: a failed order configuration is worth reading twice.
    const ttl = kind === "error" ? 8_000 : 3_000;
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), ttl);
  }, []);

  const api = React.useMemo<ToastApi>(
    () => ({
      error: (message) => push("error", message),
      success: (message) => push("success", message),
      report: (result, successMessage) => {
        if (result && "error" in result && result.error) {
          push("error", result.error);
          return false;
        }
        if (successMessage) push("success", successMessage);
        return true;
      },
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        // Announced without stealing focus — the user is mid-task.
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-2 rounded-sm border px-3 py-2 text-sm shadow-md ${
              toast.kind === "error"
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-border bg-background text-foreground"
            }`}
          >
            {toast.kind === "error" ? (
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-positive" />
            )}
            <span className="flex-1 break-words">{toast.message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              className="shrink-0 opacity-60 hover:opacity-100"
              onClick={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
