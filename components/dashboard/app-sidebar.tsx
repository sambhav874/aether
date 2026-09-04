"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LifeBuoy, Settings } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { navGroups } from "@/components/dashboard/nav-config";
import {
  ConnectionHealthWidget,
  type ConnectionAccountStatus,
} from "@/components/dashboard/connection-health-widget";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";

type Organization = { id: string; name: string; slug: string };

export function AppSidebar({
  organizations,
  activeOrganizationId,
  connectionAccounts,
  issueCount,
  healthPct,
}: {
  organizations: Organization[];
  activeOrganizationId: string;
  connectionAccounts: ConnectionAccountStatus[];
  issueCount: number;
  healthPct: number;
}) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <OrgSwitcher
              organizations={organizations}
              activeOrganizationId={activeOrganizationId}
            />
          </SidebarGroupContent>
        </SidebarGroup>

        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isParent = "children" in item;
                  const isActive = isParent
                    ? item.children.some((c) => pathname.startsWith(c.href))
                    : pathname === item.href;

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isActive}
                        className="relative data-active:before:absolute data-active:before:-left-2 data-active:before:top-1.5 data-active:before:bottom-1.5 data-active:before:w-0.5 data-active:before:rounded-full data-active:before:bg-brand data-active:before:content-['']"
                        render={<Link href={item.href} />}
                      >
                        {item.icon && <item.icon />}
                        <span>{item.title}</span>
                        {item.badge && (
                          <Badge
                            variant="secondary"
                            className="ml-auto h-4 px-1 text-[10px] font-medium"
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </SidebarMenuButton>
                      {isParent && (
                        <SidebarMenuSub>
                          {item.children.map((child) => (
                            <SidebarMenuSubItem key={child.href}>
                              <SidebarMenuSubButton
                                isActive={pathname.startsWith(child.href)}
                                render={<Link href={child.href} />}
                              >
                                {child.icon && <child.icon />}
                                <span>{child.title}</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <ConnectionHealthWidget
          issueCount={issueCount}
          healthPct={healthPct}
          accounts={connectionAccounts}
        />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname.startsWith("/dashboard/settings")}
              render={<Link href="/dashboard/settings" />}
            >
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<a href="https://help.morwl.example" target="_blank" rel="noreferrer" />}
            >
              <LifeBuoy />
              <span>Help center</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
