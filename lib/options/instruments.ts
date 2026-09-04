// Client-safe mirror of lib/runners/dhan/option-chain.ts's instrument keys —
// that module is server-only (holds Dhan security IDs used in real API
// calls), so this tiny label list is duplicated rather than imported, to
// keep it usable from client components.
export const OPTION_CHAIN_INSTRUMENT_LABELS = {
  NIFTY: "NIFTY",
  BANKNIFTY: "Bank Nifty",
  SENSEX: "Sensex",
} as const;
