import { relations } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  numeric,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { organization } from "./auth-schema";
import type { AccountDetails } from "@/lib/runners/types";

export const brokerProviderEnum = pgEnum("broker_provider", [
  "metaapi",
  "zerodha",
  "dhan",
  "motilal",
]);

export const brokerAccountStatusEnum = pgEnum("broker_account_status", [
  "connected",
  "disconnected",
  "needs_reauth",
  "syncing",
  // SEBI requires Indian broker order placement to originate from a static,
  // whitelisted IP — auth succeeding doesn't mean the account can trade yet,
  // so zerodha/dhan/motilal accounts land here until a human confirms the IP
  // is whitelisted on the broker's own dashboard (nothing in these APIs
  // reports that back to us).
  "whitelist_pending",
]);

export const brokerAccounts = pgTable(
  "broker_accounts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    provider: brokerProviderEnum("provider").notNull(),
    externalAccountId: text("external_account_id").notNull(),
    label: text("label").notNull(),
    status: brokerAccountStatusEnum("status").notNull().default("disconnected"),
    // Independent of `status` — a trader-facing kill switch. Disabling an
    // account blocks new order placement (checked at dispatch time) without
    // tearing down the stored credentials or connection the way delete does.
    enabled: boolean("enabled").default(true).notNull(),
    // Whether this account's ticks/positions feed the shared workspace
    // position sync job. Independent of `enabled` — a member can pause the
    // noisy background poll for an account while still allowing manual
    // trading on it.
    positionSyncEnabled: boolean("position_sync_enabled").default(true).notNull(),
    // The egress IP the account needs whitelisted with the broker. Copied
    // from BROKER_RUNNER_STATIC_IP at connect time rather than looked up
    // live, so a future multi-region fixed-IP setup can vary it per account
    // without a schema change.
    staticIp: text("static_ip"),
    balance: numeric("balance", { precision: 18, scale: 2 }),
    equity: numeric("equity", { precision: 18, scale: 2 }),
    currency: text("currency").default("USD"),
    // Whatever else the broker reports about the account — leverage, credit,
    // margin mode, server, login, holder name. Refreshed on every balance
    // sync. JSON rather than columns because the shape is provider-specific
    // and read-only display data: nothing queries or joins on it, and a new
    // broker adding a field must not cost a migration. Shape: AccountDetails
    // in lib/runners/types.ts.
    metadata: jsonb("metadata").$type<AccountDetails>(),
    lastSyncAt: timestamp("last_sync_at"),
    // AES-256-GCM ciphertext (iv:tag:data, base64) of provider-specific
    // credentials/tokens — see lib/crypto.ts. Never stored in plaintext.
    credentialsEncrypted: text("credentials_encrypted"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("broker_accounts_workspace_provider_external_uidx").on(
      table.workspaceId,
      table.provider,
      table.externalAccountId,
    ),
    index("broker_accounts_workspace_idx").on(table.workspaceId),
  ],
);

export const brokerAccountsRelations = relations(brokerAccounts, ({ one }) => ({
  workspace: one(organization, {
    fields: [brokerAccounts.workspaceId],
    references: [organization.id],
  }),
}));
