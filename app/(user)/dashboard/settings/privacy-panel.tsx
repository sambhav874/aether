"use client";

import * as React from "react";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteMyAccount, exportMyData } from "@/lib/privacy/actions";

/**
 * Data access and erasure — DPDP Act 2023 rights, reachable rather than
 * theoretical.
 */
export function PrivacyPanel() {
  const [confirmation, setConfirmation] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  async function onExport() {
    setError(null);
    setExporting(true);
    try {
      const bundle = await exportMyData();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `aether-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[privacy] export failed —", err);
      setError("Export failed. Try again in a moment.");
    } finally {
      setExporting(false);
    }
  }

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteMyAccount(confirmation);
      if (result.error) setError(result.error);
      // On success the session is gone; the auth layer redirects.
    });
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold">Download your data</h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Everything this workspace holds about you — strategies, positions, connected
            account names, feeds, notification settings and the audit trail — as a JSON file.
            Broker API credentials are not included; handing those back in plaintext would
            undo the reason they&apos;re encrypted.
          </p>
        </div>
        <div>
          <Button variant="outline" onClick={onExport} disabled={exporting}>
            <Download className="size-4" />
            {exporting ? "Preparing…" : "Download JSON"}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-sm border border-destructive/30 p-4">
        <div>
          <h2 className="text-base font-semibold text-destructive">Delete your account</h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Permanently removes your account, this workspace, and every connected broker
            credential. This cannot be undone.
          </p>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            <strong className="text-foreground">Open positions are not closed by this.</strong>{" "}
            Deleting here removes your record of them; whatever is open at your broker stays
            open. Close them first — the form will refuse until you do.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="delete-confirm">Type DELETE to confirm</Label>
          <Input
            id="delete-confirm"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder="DELETE"
            className="max-w-xs"
            autoComplete="off"
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={pending || confirmation.trim().toUpperCase() !== "DELETE"}
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
            {pending ? "Deleting…" : "Delete my account"}
          </Button>
        </div>
      </section>
    </div>
  );
}
