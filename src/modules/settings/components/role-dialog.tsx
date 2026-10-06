"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RESOURCES, ACTIONS } from "@/lib/rbac";
import { createRoleAction, updateRoleAction } from "../actions/settings.actions";

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

interface Props {
  open: boolean;
  role?: RoleRow;
  onClose: () => void;
}

export function RoleDialog({ open, role, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setName(role?.name ?? "");
    setDescription(role?.description ?? "");
    setPermissions(new Set(role?.permissions ?? []));
  }, [open, role]);

  const has = (perm: string) => {
    const [resource] = perm.split(":");
    return permissions.has(perm) || permissions.has(`${resource}:*`);
  };

  const toggle = (perm: string, checked: boolean) =>
    setPermissions((prev) => {
      const next = new Set(prev);
      const [resource, action] = perm.split(":");
      if (action === "*") {
        // Wildcard subsumes the row: clear the per-action grants either way.
        for (const a of ACTIONS) next.delete(`${resource}:${a}`);
        if (checked) next.add(perm);
        else next.delete(perm);
      } else if (checked) {
        next.add(perm);
      } else {
        // Unchecking one action under a wildcard expands it into the rest.
        if (next.delete(`${resource}:*`)) {
          for (const a of ACTIONS) if (a !== action) next.add(`${resource}:${a}`);
        }
        next.delete(perm);
      }
      return next;
    });

  const submit = () =>
    startTransition(async () => {
      const input = { name, description, permissions: [...permissions] };
      const result = role
        ? await updateRoleAction(role.id, input)
        : await createRoleAction(input);
      if (result.ok) {
        toast.success(role ? "Role updated" : "Role created");
        onClose();
        router.refresh();
      } else {
        toast.error(result.error.fields?.name || result.error.message);
      }
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{role ? "Edit role" : "New role"}</DialogTitle>
          <DialogDescription>
            Custom roles extend a user&apos;s system-role permissions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="role-name">Name *</Label>
              <Input
                id="role-name"
                placeholder="Shift supervisor"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-desc">Description</Label>
              <Input
                id="role-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <ScrollArea className="h-80 rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b">
                  <th className="p-2 text-left font-medium">Resource</th>
                  <th className="p-2 text-center font-medium">All</th>
                  {ACTIONS.map((action) => (
                    <th key={action} className="p-2 text-center font-medium capitalize">
                      {action}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RESOURCES.map((resource) => (
                  <tr key={resource} className="border-b last:border-0">
                    <td className="p-2 capitalize">{resource}</td>
                    <td className="p-2 text-center">
                      <Checkbox
                        aria-label={`All ${resource} permissions`}
                        checked={permissions.has(`${resource}:*`)}
                        onCheckedChange={(checked) =>
                          toggle(`${resource}:*`, checked === true)
                        }
                      />
                    </td>
                    {ACTIONS.map((action) => (
                      <td key={action} className="p-2 text-center">
                        <Checkbox
                          aria-label={`${resource}:${action}`}
                          checked={has(`${resource}:${action}`)}
                          onCheckedChange={(checked) =>
                            toggle(`${resource}:${action}`, checked === true)
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim() || permissions.size === 0}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {role ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
