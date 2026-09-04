"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inviteMember, cancelInvitation, removeMember, updateMemberRole } from "@/lib/settings/actions";
import { ROLE_LABELS, ROLE_DESCRIPTIONS, type WorkspaceRole } from "@/lib/auth/permissions";

const ROLES = Object.keys(ROLE_LABELS) as WorkspaceRole[];
const INVITABLE_ROLES = ROLES.filter((r) => r !== "owner");
type Role = WorkspaceRole;

function roleLabel(role: string) {
  return ROLE_LABELS[role as WorkspaceRole] ?? role;
}

export type MemberRow = { id: string; userId: string; name: string; email: string; role: string };
export type InvitationRow = { id: string; email: string; role: string; status: string; expiresAt: Date };

export function MembersPanel({
  members,
  invitations,
  currentUserId,
}: {
  members: MemberRow[];
  invitations: InvitationRow[];
  currentUserId: string;
}) {
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("trader");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await inviteMember(email, role);
      if (result.error) {
        setError(result.error);
      } else {
        setEmail("");
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">
        People with access to your workspace. Roles control what each member can see and change.
      </p>

      <Tabs defaultValue="members">
        <TabsList variant="line">
          <TabsTrigger value="members" className="gap-1.5">
            Members
            <Badge variant="secondary" className="h-4.5 px-1.5">
              {members.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
          <TabsTrigger value="roles">Roles & permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4 pt-4">
          <form onSubmit={handleInvite} className="flex flex-wrap items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs text-muted-foreground">Invite by email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
                required
              />
            </div>
            <Select value={role} onValueChange={(v) => v && setRole(v as Role)}>
              <SelectTrigger className="w-44">
                <SelectValue>{(v: Role) => roleLabel(v)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {INVITABLE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {roleLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Invite"}
            </Button>
          </form>
          {error && <p className="text-sm text-negative">{error}</p>}

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{member.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{member.email}</td>
                    <td className="px-3 py-2">
                      {member.userId === currentUserId || member.role === "owner" ? (
                        <Badge variant="secondary">{roleLabel(member.role)}</Badge>
                      ) : (
                        <Select
                          value={member.role}
                          onValueChange={(v) => v && startTransition(() => updateMemberRole(member.id, v as string))}
                        >
                          <SelectTrigger size="sm" className="w-44">
                            <SelectValue>{(v: string) => roleLabel(v)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {INVITABLE_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {roleLabel(r)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {member.userId !== currentUserId && member.role !== "owner" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => startTransition(() => removeMember(member.id))}
                        >
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="invitations" className="pt-4">
          {invitations.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No pending invitations.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Role</th>
                    <th className="px-3 py-2 font-medium">Expires</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((invitation) => (
                    <tr key={invitation.id} className="border-b last:border-0">
                      <td className="px-3 py-2">{invitation.email}</td>
                      <td className="px-3 py-2 text-muted-foreground">{roleLabel(invitation.role)}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {invitation.expiresAt.toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => startTransition(() => cancelInvitation(invitation.id))}
                        >
                          Cancel
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="roles" className="pt-4">
          <div className="divide-y rounded-lg border">
            {ROLES.map((r) => (
              <div key={r} className="px-3 py-3">
                <p className="text-sm font-medium">{roleLabel(r)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</p>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
