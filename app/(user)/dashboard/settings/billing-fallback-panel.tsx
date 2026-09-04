const FEATURES = [
  "Unlimited connected broker accounts",
  "Unlimited strategies and webhook signals",
  "Telegram notifications",
  "Market news and heatmap data",
];

export function BillingFallbackPanel() {
  return (
    <div className="max-w-md space-y-6">
      <div className="card-elevated rounded-lg border border-border/70 bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="font-medium">Free (beta)</p>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">No card required</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Billing isn&rsquo;t enabled yet — every workspace runs on this plan with full access while we
          finalize a payment provider. Nothing here will unexpectedly start charging you.
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Included</p>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-positive" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted-foreground">
        Usage and credit metering aren&rsquo;t tracked yet either — there&rsquo;s nothing to report here
        until a plan structure exists. Both this page and the plan itself will be replaced once a
        billing vendor is chosen.
      </p>
    </div>
  );
}
