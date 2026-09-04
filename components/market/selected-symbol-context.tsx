"use client";

import * as React from "react";

export type Selected =
  | { source: "tradingview"; tvSymbol: string; label: string }
  | { source: "india"; symbol: string; kind: "equity" | "index"; label: string; tvSymbol?: string };

const SelectedSymbolContext = React.createContext<{
  selected: Selected | null;
  setSelected: (s: Selected) => void;
} | null>(null);

export function SelectedSymbolProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = React.useState<Selected | null>(null);
  const value = React.useMemo(() => ({ selected, setSelected }), [selected]);
  return <SelectedSymbolContext.Provider value={value}>{children}</SelectedSymbolContext.Provider>;
}

export function useSelectedSymbol() {
  const ctx = React.useContext(SelectedSymbolContext);
  if (!ctx) throw new Error("useSelectedSymbol must be used within SelectedSymbolProvider");
  return ctx;
}
