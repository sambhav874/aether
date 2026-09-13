"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, LogOut, Settings, User } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { pageTitleForPath } from "@/components/dashboard/nav-config";
import { authClient } from "@/lib/auth/client";
import { HaltControl } from "@/components/dashboard/halt-control";
import type { HaltState } from "@/lib/strategies/halt";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Topbar({
  userName,
  userEmail,
  haltState,
}: {
  userName: string;
  userEmail: string;
  haltState: HaltState;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const title = pageTitleForPath(pathname);

  async function onSignOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-2">
        <HaltControl initialState={haltState} />

        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="size-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" className="rounded-none" aria-label="Account menu" />}
          >
            <Avatar className="size-7 rounded-none border border-black/15 dark:border-white/15">
              <AvatarFallback className="rounded-none bg-[#c8102e] text-[11px] font-bold text-[#f3f1ed]">
                {initials(userName || userEmail)}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-none border border-black/15 dark:border-white/15">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-medium">{userName}</p>
              <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<a href="/dashboard/settings?tab=profile" />}>
              <User className="size-4" />
              My Account
            </DropdownMenuItem>
            <DropdownMenuItem render={<a href="/dashboard/settings?tab=theme" />}>
              <Settings className="size-4" />
              Appearance
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut} variant="destructive">
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
