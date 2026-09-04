import { formatMoney } from "@/lib/format";
import type { BrokerProvider } from "@/lib/runners/types";

const PROVIDER_LABEL: Record<BrokerProvider, string> = {
  metaapi: "Bridge (MT5)",
  zerodha: "Zerodha",
  dhan: "Dhan",
  motilal: "Motilal Oswal",
};

export type AccountRow = {
  id: string;
  label: string;
  provider: BrokerProvider;
  balance: number | null;
  currency: "USD" | "INR";
};

export function AccountsPanel({ accounts }: { accounts: AccountRow[] }) {
  const totalsByCurrency = new Map<string, number>();
  for (const account of accounts) {
    if (account.balance === null) continue;
    totalsByCurrency.set(account.currency, (totalsByCurrency.get(account.currency) ?? 0) + account.balance);
  }
  const totalLabel = Array.from(totalsByCurrency.entries())
    .map(([currency, total]) => formatMoney(total, currency as "USD" | "INR"))
    .join(" · ");

  return (
    <div className="card-elevated rounded-lg border border-border/70 bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <h2 className="text-sm font-semibold">Accounts</h2>
          <p className="text-xs text-muted-foreground">Value across every connected broker</p>
        </div>
        {totalLabel && <span className="tabular-figures text-lg font-semibold">{totalLabel}</span>}
      </div>

      {accounts.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No broker accounts connected yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {accounts.map((account) => (
            <div key={account.id} className="rounded-lg border p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase">
                {PROVIDER_LABEL[account.provider]}{" "}
                <span className="normal-case text-foreground">{account.label}</span>
              </p>
              <p className="tabular-figures mt-1 text-lg font-semibold">
                {formatMoney(account.balance, account.currency)}
              </p>
              <p className="tabular-figures text-xs text-muted-foreground">
                {formatMoney(account.balance, account.currency)} available
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
