"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Market } from "@/db/schema";

export const ALL = "__all__";
export type RangeValue = "today" | "7d" | "30d" | "90d" | "ytd" | "all";

export type PerformanceFilterValue = {
  range: RangeValue;
  market: Market | typeof ALL;
  accountId: string;
  symbol: string;
  side: "long" | "short" | typeof ALL;
};

const RANGE_LABEL: Record<RangeValue, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  ytd: "Year to date",
  all: "All time",
};

const MARKET_LABEL: Record<Market, string> = {
  forex: "Forex",
  indian_options: "Indian Options",
  indian_equity: "Indian Equity",
};

export function rangeLabel(range: RangeValue) {
  return RANGE_LABEL[range];
}

export function PerformanceFilters({
  accounts,
  symbols,
  value,
  onChange,
}: {
  accounts: { id: string; label: string }[];
  symbols: string[];
  value: PerformanceFilterValue;
  onChange: (value: PerformanceFilterValue) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value.range} onValueChange={(range) => onChange({ ...value, range: range as RangeValue })}>
        <SelectTrigger size="sm" className="min-w-36">
          <SelectValue>{(v: RangeValue) => RANGE_LABEL[v]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(RANGE_LABEL) as RangeValue[]).map((r) => (
            <SelectItem key={r} value={r}>
              {RANGE_LABEL[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.market}
        onValueChange={(market) => onChange({ ...value, market: market as PerformanceFilterValue["market"] })}
      >
        <SelectTrigger size="sm" className="min-w-32">
          <SelectValue>
            {(v: PerformanceFilterValue["market"]) => (v === ALL ? "All assets" : MARKET_LABEL[v])}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All assets</SelectItem>
          {(Object.keys(MARKET_LABEL) as Market[]).map((m) => (
            <SelectItem key={m} value={m}>
              {MARKET_LABEL[m]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={value.accountId} onValueChange={(accountId) => onChange({ ...value, accountId: accountId as string })}>
        <SelectTrigger size="sm" className="min-w-32">
          <SelectValue>
            {(id: string) => (id === ALL ? "All accounts" : (accounts.find((a) => a.id === id)?.label ?? id))}
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

      <Select value={value.symbol} onValueChange={(symbol) => onChange({ ...value, symbol: symbol as string })}>
        <SelectTrigger size="sm" className="min-w-32">
          <SelectValue>{(symbol: string) => (symbol === ALL ? "All symbols" : symbol)}</SelectValue>
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

      <Select
        value={value.side}
        onValueChange={(side) => onChange({ ...value, side: side as PerformanceFilterValue["side"] })}
      >
        <SelectTrigger size="sm" className="min-w-28">
          <SelectValue>
            {(v: PerformanceFilterValue["side"]) => (v === ALL ? "All sides" : v === "long" ? "Long" : "Short")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All sides</SelectItem>
          <SelectItem value="long">Long</SelectItem>
          <SelectItem value="short">Short</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
