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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createAccountAction, updateAccountAction } from "../actions/finance.actions";
import { ACCOUNT_TYPES } from "../dto/finance.dto";

export interface AccountRow {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId: string | null;
  isSystem: boolean;
}

interface Props {
  open: boolean;
  account?: AccountRow;
  accounts: AccountRow[];
  onClose: () => void;
}

const NO_PARENT = "__none__";

export function AccountDialog({ open, account, accounts, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("ASSET");
  const [parentId, setParentId] = useState(NO_PARENT);

  useEffect(() => {
    if (!open) return;
    setCode(account?.code ?? "");
    setName(account?.name ?? "");
    setType(account?.type ?? "ASSET");
    setParentId(account?.parentId ?? NO_PARENT);
  }, [open, account]);

  // A parent must share the child's type, and an account cannot parent itself.
  const parentOptions = accounts.filter((a) => a.type === type && a.id !== account?.id);

  const submit = () =>
    startTransition(async () => {
      const input = {
        code,
        name,
        type,
        parentId: parentId === NO_PARENT ? "" : parentId,
      };
      const result = account
        ? await updateAccountAction(account.id, input)
        : await createAccountAction(input);
      if (result.ok) {
        toast.success(account ? "Account updated" : "Account created");
        onClose();
        router.refresh();
      } else {
        const fields = result.error.fields;
        toast.error(fields?.code || fields?.name || result.error.message);
      }
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{account ? "Edit account" : "New account"}</DialogTitle>
          <DialogDescription>
            Codes are unique per organisation and drive the ordering of every statement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-[7rem_1fr] gap-3">
            <div className="space-y-2">
              <Label htmlFor="a-code">Code *</Label>
              <Input
                id="a-code"
                placeholder="1000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="a-name">Name *</Label>
              <Input
                id="a-name"
                placeholder="Cash on hand"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="a-type">Type *</Label>
            <Select value={type} onValueChange={(value) => setType(value ?? "ASSET")}>
              <SelectTrigger id="a-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.charAt(0) + t.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="a-parent">Parent account</Label>
            <Select value={parentId} onValueChange={(value) => setParentId(value ?? NO_PARENT)}>
              <SelectTrigger id="a-parent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PARENT}>Top level</SelectItem>
                {parentOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !code.trim() || !name.trim()}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {account ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
