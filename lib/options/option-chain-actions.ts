"use server";

import { requireActiveWorkspace } from "@/lib/auth/session";
import { hasWorkspacePermission } from "@/lib/auth/permissions";
import { getWorkspaceAccounts } from "@/lib/strategies/accounts";
import {
  getExpiryList,
  getOptionChain,
  type OptionChainInstrument,
  type OptionChainResult,
  type ExpiryListResult,
  type OptionStrike,
  type OptionLeg,
  type OptionChainTotals,
} from "@/lib/runners/dhan/option-chain";
import { isNseSupported, getNseExpiryList, getNseOptionChain } from "@/lib/options/nse-provider";

async function getConnectedDhanAccountId(): Promise<string | null> {
  const { workspace } = await requireActiveWorkspace();
  const accounts = await getWorkspaceAccounts(workspace.id);
  const dhanAccount = accounts.find((a) => a.provider === "dhan" && a.status === "connected");
  return dhanAccount?.id ?? null;
}

// NSE's free public feed is the default source (no broker needed); Dhan is
// only used as a fallback when NSE doesn't cover the instrument (SENSEX) or
// its unofficial endpoint is unavailable, and a Dhan account happens to be
// connected in this workspace.
export async function fetchOptionChainExpiries(instrument: OptionChainInstrument): Promise<ExpiryListResult> {
  const { role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { trading: ["view"] })) {
    return { status: "unavailable", reason: "You don't have permission to view trading data." };
  }

  if (isNseSupported(instrument)) {
    const result = await getNseExpiryList(instrument);
    if (result.status === "ok") return result;
  }

  const accountId = await getConnectedDhanAccountId();
  if (!accountId) {
    return { status: "unavailable", reason: "NSE feed unavailable and no connected Dhan account in this workspace" };
  }
  return getExpiryList(accountId, instrument);
}

export async function fetchOptionChain(instrument: OptionChainInstrument, expiry: string): Promise<OptionChainResult> {
  const { role } = await requireActiveWorkspace();
  if (!hasWorkspacePermission(role, { trading: ["view"] })) {
    return { status: "unavailable", reason: "You don't have permission to view trading data." };
  }

  if (isNseSupported(instrument)) {
    const result = await getNseOptionChain(instrument, expiry);
    if (result.status === "ok") return result;
  }

  const accountId = await getConnectedDhanAccountId();
  if (!accountId) {
    return { status: "unavailable", reason: "NSE feed unavailable and no connected Dhan account in this workspace" };
  }
  return getOptionChain(accountId, instrument, expiry);
}

export type { OptionChainInstrument, OptionChainResult, ExpiryListResult, OptionStrike, OptionLeg, OptionChainTotals };
