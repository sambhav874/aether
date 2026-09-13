"use client";

import * as React from "react";
import {
  MoreVertical,
  Pause,
  Play,
  Trash2,
  Webhook,
  History,
  Link2,
  LineChart,
  SlidersHorizontal,
  ShieldAlert,
  Zap,
  Bell,
  Eye,
  EyeOff,
  Share2,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { meetsLevel, type StrategyPermissionLevel } from "@/lib/strategies/permission-levels";

export function StrategyMenu({
  permission,
  status,
  signalsHidden,
  onWebhookInfo,
  onChart,
  onParameters,
  onRiskExits,
  onExecution,
  onNotifications,
  onToggleSignals,
  onShare,
  onTogglePause,
  onEdit,
  onLinkedAccounts,
  onSignalHistory,
  onDelete,
}: {
  permission: StrategyPermissionLevel;
  status: "active" | "paused";
  signalsHidden: boolean;
  onWebhookInfo: () => void;
  onChart: () => void;
  onParameters: () => void;
  onRiskExits: () => void;
  onExecution: () => void;
  onNotifications: () => void;
  onToggleSignals: () => void;
  onShare: () => void;
  onTogglePause: () => void;
  onEdit: () => void;
  onLinkedAccounts: () => void;
  onSignalHistory: () => void;
  onDelete: () => void;
}) {
  function item(need: StrategyPermissionLevel, needLabel: string, onClick: () => void, icon: React.ReactNode, label: string, destructive = false) {
    const enabled = meetsLevel(permission, need);
    return (
      <DropdownMenuItem
        onClick={enabled ? onClick : undefined}
        disabled={!enabled}
        variant={destructive ? "destructive" : undefined}
        title={enabled ? undefined : `Needs "${needLabel}" access or higher`}
      >
        {icon} {label}
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" aria-label="Strategy actions" />}>
        <MoreVertical className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {item("view", "View", onWebhookInfo, <Webhook className="size-4" />, "Webhook URL")}
        {item("view", "View", onChart, <LineChart className="size-4" />, "Chart")}
        {item("edit_execute", "Edit + Execute", onParameters, <SlidersHorizontal className="size-4" />, "Parameters")}
        {item("edit_execute", "Edit + Execute", onRiskExits, <ShieldAlert className="size-4" />, "Risk & exits")}
        {item("edit_execute", "Edit + Execute", onExecution, <Zap className="size-4" />, "Execution")}
        {item("edit_execute", "Edit + Execute", onNotifications, <Bell className="size-4" />, "Notifications")}
        {item(
          "edit_execute",
          "Edit + Execute",
          onToggleSignals,
          signalsHidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />,
          signalsHidden ? "View signals" : "Hide signals",
        )}
        {item("co_owner", "Co-owner", onShare, <Share2 className="size-4" />, "Share")}

        <DropdownMenuSeparator />

        {item(
          "view_execute",
          "View + Execute",
          onTogglePause,
          status === "active" ? <Pause className="size-4" /> : <Play className="size-4" />,
          status === "active" ? "Pause" : "Activate",
        )}
        {item("edit_execute", "Edit + Execute", onEdit, <Pencil className="size-4" />, "Edit strategy")}
        {item("edit_execute", "Edit + Execute", onLinkedAccounts, <Link2 className="size-4" />, "Linked accounts")}
        {item("view", "View", onSignalHistory, <History className="size-4" />, "Signal history")}
        {item("co_owner", "Co-owner", onDelete, <Trash2 className="size-4" />, "Delete", true)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
