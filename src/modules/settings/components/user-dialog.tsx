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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createUserAction, updateUserAction } from "../actions/settings.actions";
import { ASSIGNABLE_ROLES } from "../dto/settings.dto";
import type { BranchRow } from "./branch-dialog";

export interface UserRow {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  systemRole: string;
  branchIds: string[];
  status: string;
  lastLoginAt: string | null;
}

interface Props {
  open: boolean;
  user?: UserRow;
  branches: BranchRow[];
  onClose: () => void;
}

const roleLabel = (role: string) =>
  role
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");

export function UserDialog({ open, user, branches, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [systemRole, setSystemRole] = useState<string>("CASHIER");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setFirstName(user?.firstName ?? "");
    setLastName(user?.lastName ?? "");
    setEmail(user?.email ?? "");
    setPhone(user?.phone ?? "");
    setPassword("");
    setSystemRole(user?.systemRole ?? "CASHIER");
    setBranchIds(user?.branchIds ?? []);
  }, [open, user]);

  const toggleBranch = (id: string, checked: boolean) =>
    setBranchIds((ids) => (checked ? [...ids, id] : ids.filter((b) => b !== id)));

  const submit = () =>
    startTransition(async () => {
      const input = { firstName, lastName, email, phone, password, systemRole, branchIds };
      const result = user
        ? await updateUserAction(user.id, input)
        : await createUserAction(input);
      if (result.ok) {
        toast.success(user ? "User updated" : "User created");
        onClose();
        router.refresh();
      } else {
        setErrors(result.error.fields ?? {});
        toast.error(result.error.message);
      }
    });

  const canSubmit =
    firstName.trim() && lastName.trim() && email.trim() && (user || password.length >= 8);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{user ? "Edit user" : "Invite user"}</DialogTitle>
          <DialogDescription>
            Access is the role&apos;s permission set; branch assignment scopes what they see.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="u-first">First name *</Label>
              <Input id="u-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-last">Last name *</Label>
              <Input id="u-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="u-email">Email *</Label>
              <Input
                id="u-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-phone">Phone</Label>
              <Input id="u-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="u-role">Role *</Label>
              <Select value={systemRole} onValueChange={(value) => setSystemRole(value ?? "CASHIER")}>
                <SelectTrigger id="u-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {roleLabel(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-password">{user ? "New password" : "Password *"}</Label>
              <Input
                id="u-password"
                type="password"
                placeholder={user ? "Leave blank to keep" : "Min. 8 characters"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {errors.password && <p className="text-xs text-red-600">{errors.password}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Branches</Label>
            <p className="text-xs text-muted-foreground">
              Leave all unchecked to grant access to every branch.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {branches.map((branch) => (
                <label key={branch.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={branchIds.includes(branch.id)}
                    onCheckedChange={(checked) => toggleBranch(branch.id, checked === true)}
                  />
                  {branch.code} · {branch.name}
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !canSubmit}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {user ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
