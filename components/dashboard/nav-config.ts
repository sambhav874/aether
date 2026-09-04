import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  LineChart,
  Landmark,
  BarChart3,
  Wallet,
  Bot,
  Map,
  Newspaper,
  Building2,
  Sparkles,
} from "lucide-react";

export type NavLeaf = {
  title: string;
  href: string;
  icon?: LucideIcon;
  badge?: "BETA";
};

export type NavGroup = {
  label: string;
  items: (NavLeaf | (NavLeaf & { children: NavLeaf[] }))[];
};

export const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [{ title: "Trade", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Trading",
    items: [
      {
        title: "Aether",
        href: "/dashboard/monarch/performance",
        icon: LineChart,
        badge: "BETA",
        children: [
          {
            title: "Performance",
            href: "/dashboard/monarch/performance",
            icon: BarChart3,
          },
          {
            title: "Forex",
            href: "/dashboard/monarch/forex",
            icon: Landmark,
          },
          {
            title: "Indian Options",
            href: "/dashboard/monarch/indian-options",
            icon: LineChart,
          },
          {
            title: "Indian Equity",
            href: "/dashboard/monarch/indian-equity",
            icon: Wallet,
          },
          {
            title: "Strategies",
            href: "/dashboard/monarch/strategies",
            icon: Bot,
          },
          {
            title: "Research",
            href: "/dashboard/monarch/research",
            icon: Newspaper,
          },
          {
            title: "Company Research",
            href: "/dashboard/monarch/company-research",
            icon: Building2,
          },
          {
            title: "Copilot",
            href: "/dashboard/monarch/copilot",
            icon: Sparkles,
            badge: "BETA",
          },
        ],
      },
      {
        title: "Heatmap",
        href: "/dashboard/heatmap",
        icon: Map,
        badge: "BETA",
      },
    ],
  },
];

export function pageTitleForPath(pathname: string): string {
  for (const group of navGroups) {
    for (const item of group.items) {
      if ("children" in item) {
        for (const child of item.children) {
          if (pathname.startsWith(child.href)) return child.title;
        }
      }
      if (pathname.startsWith(item.href) && item.href !== "/dashboard") {
        return item.title;
      }
    }
  }
  if (pathname === "/dashboard") return "Trade";
  if (pathname.startsWith("/dashboard/settings")) return "Settings";
  return "Dashboard";
}
