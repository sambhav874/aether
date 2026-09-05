"use client";

/**
 * Last-resort boundary: catches errors thrown in the root layout itself,
 * which a route-level error.tsx can never see. It replaces <html>, so it
 * cannot use any provider, font variable or global style from app/layout.tsx
 * — everything here is inline on purpose.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fafafa",
          color: "#111827",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "34rem" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 8px" }}>
            Something broke while loading the app
          </h1>
          <p style={{ margin: "0 0 20px", lineHeight: 1.6, color: "#4b5563" }}>
            No trading action was taken as a result of this error. Reload to try
            again — if it keeps happening, quote the reference below.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid #111827",
              background: "#111827",
              color: "#fff",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest ? (
            <p style={{ marginTop: "20px", fontSize: "0.75rem", color: "#6b7280", fontFamily: "ui-monospace, monospace" }}>
              Reference {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
