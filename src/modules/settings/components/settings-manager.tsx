"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteBranchAction,
  deleteUserAction,
  deleteRoleAction,
} from "../actions/settings.actions";
import { OrganizationForm, type OrganizationRow } from "./organization-form";
import { BranchDialog, type BranchRow } from "./branch-dialog";
import { UserDialog, type UserRow } from "./user-dialog";
import { RoleDialog, type RoleRow } from "./role-dialog";
import { AuditLogTable, type AuditEntry } from "./audit-log-table";

export type AuditRow = AuditEntry;

interface Props {
  organization: OrganizationRow;
  branches: BranchRow[];
  users: UserRow[];
  roles: RoleRow[];
  auditTrail: AuditRow[];
  currentUserId: string;
}

const roleLabel = (role: string) =>
  role
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");

const dateTime = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function SettingsManager({
  organization,
  branches,
  users,
  roles,
  auditTrail,
  currentUserId,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const [branchDialog, setBranchDialog] = useState<{ open: boolean; branch?: BranchRow }>({
    open: false,
  });
  const [userDialog, setUserDialog] = useState<{ open: boolean; user?: UserRow }>({
    open: false,
  });
  const [roleDialog, setRoleDialog] = useState<{ open: boolean; role?: RoleRow }>({
    open: false,
  });

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(search.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  };

  const tab = search.get("tab") ?? "organization";

  const removeBranch = async (branch: BranchRow) => {
    if (!confirm(`Remove branch "${branch.name}"?`)) return;
    const result = await deleteBranchAction(branch.id);
    if (result.ok) {
      toast.success("Branch removed");
      router.refresh();
    } else toast.error(result.error.message);
  };

  const removeUser = async (user: UserRow) => {
    if (!confirm(`Remove ${user.fullName}? Their sessions are revoked immediately.`)) return;
    const result = await deleteUserAction(user.id);
    if (result.ok) {
      toast.success("User removed");
      router.refresh();
    } else toast.error(result.error.message);
  };

  const removeRole = async (role: RoleRow) => {
    if (!confirm(`Delete role "${role.name}"?`)) return;
    const result = await deleteRoleAction(role.id);
    if (result.ok) {
      toast.success("Role deleted");
      router.refresh();
    } else toast.error(result.error.message);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Organization profile, branches, users, roles and the audit trail
        </p>
      </div>

      <Tabs value={tab} onValueChange={(value) => setParam("tab", value)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="branches">Branches</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="organization">
          <OrganizationForm organization={organization} />
        </TabsContent>

        <TabsContent value="branches" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setBranchDialog({ open: true })}>
              <Plus className="size-4" /> New branch
            </Button>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((branch) => (
                  <TableRow key={branch.id}>
                    <TableCell className="font-mono text-sm">{branch.code}</TableCell>
                    <TableCell className="font-medium">{branch.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {[branch.city, branch.country].filter(Boolean).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {branch.phone || branch.email || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${branch.name}`}
                          onClick={() => setBranchDialog({ open: true, branch })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${branch.name}`}
                          onClick={() => removeBranch(branch)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setUserDialog({ open: true })}>
              <Plus className="size-4" /> Invite user
            </Button>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Branches</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.fullName}
                      {user.id === currentUserId && (
                        <Badge variant="secondary" className="ml-2">
                          You
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{roleLabel(user.systemRole)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.branchIds.length === 0
                        ? "All"
                        : branches
                            .filter((b) => user.branchIds.includes(b.id))
                            .map((b) => b.code)
                            .join(", ")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.lastLoginAt ? dateTime.format(new Date(user.lastLoginAt)) : "Never"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${user.fullName}`}
                          onClick={() => setUserDialog({ open: true, user })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${user.fullName}`}
                          disabled={user.id === currentUserId}
                          onClick={() => removeUser(user)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="roles" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setRoleDialog({ open: true })}>
              <Plus className="size-4" /> New role
            </Button>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Permissions</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No custom roles yet. System roles cover the common cases; add a role for
                      anything bespoke.
                    </TableCell>
                  </TableRow>
                )}
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {role.isSystem && (
                          <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
                        )}
                        {role.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {role.description || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {role.permissions.length}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{role.userCount}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${role.name}`}
                          disabled={role.isSystem}
                          onClick={() => setRoleDialog({ open: true, role })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${role.name}`}
                          disabled={role.isSystem}
                          onClick={() => removeRole(role)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="audit" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Recent activity.{" "}
            <Link href="/audit" className="text-primary underline-offset-4 hover:underline">
              Open the full audit log
            </Link>
            .
          </p>
          <AuditLogTable entries={auditTrail} />
        </TabsContent>
      </Tabs>

      <BranchDialog
        open={branchDialog.open}
        branch={branchDialog.branch}
        onClose={() => setBranchDialog({ open: false })}
      />
      <UserDialog
        open={userDialog.open}
        user={userDialog.user}
        branches={branches}
        onClose={() => setUserDialog({ open: false })}
      />
      <RoleDialog
        open={roleDialog.open}
        role={roleDialog.role}
        onClose={() => setRoleDialog({ open: false })}
      />
    </div>
  );
}
