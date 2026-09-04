"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type HeaderFilterValue = {
  symbol: string;
  strategyId: string;
  accountId: string;
};

export const ALL = "__all__";

export function HeaderFilters({
  symbols,
  strategies,
  accounts,
  value,
  onChange,
}: {
  symbols: string[];
  strategies: { id: string; label: string }[];
  accounts: { id: string; label: string }[];
  value: HeaderFilterValue;
  onChange: (value: HeaderFilterValue) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={value.symbol}
        onValueChange={(symbol) => onChange({ ...value, symbol: symbol as string })}
      >
        <SelectTrigger size="sm" className="min-w-32">
          <SelectValue>
            {(symbol: string) => (symbol === ALL ? "All symbols" : symbol)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All symbols</SelectItem>
          {symbols.map((symbol) => (
            <SelectItem key={symbol} value={symbol}>
              {symbol}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {strategies.length > 0 && (
        <Select
          value={value.strategyId}
          onValueChange={(strategyId) => onChange({ ...value, strategyId: strategyId as string })}
        >
          <SelectTrigger size="sm" className="min-w-32">
            <SelectValue>
              {(strategyId: string) =>
                strategyId === ALL
                  ? "All strategies"
                  : (strategies.find((s) => s.id === strategyId)?.label ?? strategyId)
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All strategies</SelectItem>
            {strategies.map((strategy) => (
              <SelectItem key={strategy.id} value={strategy.id}>
                {strategy.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {accounts.length > 0 && (
        <Select
          value={value.accountId}
          onValueChange={(accountId) => onChange({ ...value, accountId: accountId as string })}
        >
          <SelectTrigger size="sm" className="min-w-32">
            <SelectValue>
              {(accountId: string) =>
                accountId === ALL
                  ? "All accounts"
                  : (accounts.find((a) => a.id === accountId)?.label ?? accountId)
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All accounts</SelectItem>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
