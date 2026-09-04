import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, twoFactor } from "better-auth/plugins";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import {
  ac,
  admin,
  owner,
  trader,
  viewer,
  strategist,
  analyst,
  researcher,
  integrationsManager,
  integrationsViewer,
} from "@/lib/auth/permissions";

// A "workspace" in the product is Better Auth's "organization" entity —
// its generated organization/member/invitation tables ARE our
// workspaces/memberships/invitations tables, so we don't duplicate them.
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    organization({
      ac,
      roles: { owner, admin, strategist, trader, analyst, researcher, integrationsManager, integrationsViewer, viewer },
      creatorRole: "owner",
    }),
    twoFactor({ issuer: "Aether" }),
  ],
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
});

export type Session = typeof auth.$Infer.Session;
