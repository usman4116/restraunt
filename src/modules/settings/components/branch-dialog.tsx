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
import { createBranchAction, updateBranchAction } from "../actions/settings.actions";

export interface BranchRow {
  id: string;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  status: string;
}

interface Props {
  open: boolean;
  branch?: BranchRow;
  onClose: () => void;
}

const EMPTY = {
  name: "",
  code: "",
  address: "",
  city: "",
  country: "",
  phone: "",
  email: "",
};

export function BranchDialog({ open, branch, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      branch
        ? {
            name: branch.name,
            code: branch.code,
            address: branch.address ?? "",
            city: branch.city ?? "",
            country: branch.country ?? "",
            phone: branch.phone ?? "",
            email: branch.email ?? "",
          }
        : EMPTY,
    );
  }, [open, branch]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = () =>
    startTransition(async () => {
      const result = branch
        ? await updateBranchAction(branch.id, form)
        : await createBranchAction(form);
      if (result.ok) {
        toast.success(branch ? "Branch updated" : "Branch created");
        onClose();
        router.refresh();
      } else {
        setErrors(result.error.fields ?? {});
        toast.error(result.error.message);
      }
    });

  const field = (
    key: keyof typeof form,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <div className="space-y-2">
      <Label htmlFor={`b-${key}`}>{label}</Label>
      <Input id={`b-${key}`} value={form[key]} onChange={set(key)} {...props} />
      {errors[key] && <p className="text-xs text-red-600">{errors[key]}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{branch ? "Edit branch" : "New branch"}</DialogTitle>
          <DialogDescription>
            The code prefixes order numbers (e.g. B01-000123) and must be unique.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            {field("name", "Name *", { placeholder: "Downtown" })}
            {field("code", "Code *", { placeholder: "B01" })}
          </div>
          {field("address", "Address")}
          <div className="grid gap-3 sm:grid-cols-2">
            {field("city", "City")}
            {field("country", "Country")}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("phone", "Phone")}
            {field("email", "Email", { type: "email" })}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !form.name.trim() || !form.code.trim()}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {branch ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
