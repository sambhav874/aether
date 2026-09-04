"use client";

import { createAuthClient } from "better-auth/react";
import { organizationClient, twoFactorClient } from "better-auth/client/plugins";
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

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [
    organizationClient({
      ac,
      roles: { owner, admin, strategist, trader, analyst, researcher, integrationsManager, integrationsViewer, viewer },
    }),
    twoFactorClient(),
  ],
});

export const { useSession, signIn, signOut, signUp, organization, useListOrganizations, useActiveOrganization } =
  authClient;
