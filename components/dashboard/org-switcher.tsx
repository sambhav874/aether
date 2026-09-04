"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { authClient } from "@/lib/auth/client";

type Organization = { id: string; name: string; slug: string };

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function OrgSwitcher({
  organizations,
  activeOrganizationId,
}: {
  organizations: Organization[];
  activeOrganizationId: string;
}) {
  const router = useRouter();
  const active = organizations.find((o) => o.id === activeOrganizationId);

  async function switchTo(orgId: string) {
    if (orgId === activeOrganizationId) return;
    await authClient.organization.setActive({ organizationId: orgId });
    router.refresh();
  }

  if (!active) return null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="rounded-none" />}>
            <Avatar className="size-6 rounded-none border border-black/15 dark:border-white/15">
              <AvatarFallback className="rounded-none bg-[#c8102e] text-[10px] font-bold text-[#f3f1ed]">
                {initials(active.name)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate font-medium">{active.name}</span>
            <ChevronsUpDown className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 rounded-none border border-black/15 dark:border-white/15">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Workspaces
            </DropdownMenuLabel>
            {organizations.map((org) => (
              <DropdownMenuItem
                key={org.id}
                onClick={() => switchTo(org.id)}
                className="gap-2"
              >
                <Avatar className="size-5 rounded-md">
                  <AvatarFallback className="rounded-md text-[10px]">
                    {initials(org.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{org.name}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push("/onboarding/workspace")}
              className="gap-2"
            >
              <Plus className="size-4" />
              New workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
