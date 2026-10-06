"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  supplierSchema,
  type SupplierInput,
  type SupplierFormValues,
} from "../dto/purchasing.dto";
import { createSupplierAction, updateSupplierAction } from "../actions/purchasing.actions";
import type { SupplierRow } from "./purchasing-manager";

interface Props {
  open: boolean;
  supplier?: SupplierRow;
  onClose: () => void;
}

const empty = (): SupplierFormValues => ({
  name: "", contactName: "", email: "", phone: "", address: "", paymentTermsDays: 30,
});

export function SupplierDialog({ open, supplier, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<SupplierFormValues, unknown, SupplierInput>({
    resolver: zodResolver(supplierSchema),
    defaultValues: empty(),
  });
  const errors = form.formState.errors;

  useEffect(() => {
    if (open) {
      form.reset(
        supplier
          ? {
              name: supplier.name,
              contactName: supplier.contactName ?? "",
              email: supplier.email ?? "",
              phone: supplier.phone ?? "",
              address: supplier.address ?? "",
              paymentTermsDays: supplier.paymentTermsDays,
            }
          : empty(),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supplier]);

  const onSubmit = (values: SupplierInput) =>
    startTransition(async () => {
      const result = supplier
        ? await updateSupplierAction(supplier.id, values)
        : await createSupplierAction(values);
      if (result.ok) {
        toast.success(supplier ? "Supplier updated" : "Supplier created");
        onClose();
        router.refresh();
      } else {
        toast.error(result.error.message);
        for (const [field, message] of Object.entries(result.error.fields ?? {})) {
          form.setError(field as keyof SupplierFormValues, { message });
        }
      }
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{supplier ? "Edit supplier" : "New supplier"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="sup-name">Name</Label>
            <Input id="sup-name" {...form.register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sup-contact">Contact person</Label>
              <Input id="sup-contact" {...form.register("contactName")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sup-phone">Phone</Label>
              <Input id="sup-phone" {...form.register("phone")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sup-email">Email</Label>
              <Input id="sup-email" type="email" {...form.register("email")} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sup-terms">Payment terms (days)</Label>
              <Input id="sup-terms" type="number" min="0" {...form.register("paymentTermsDays")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sup-address">Address</Label>
            <Input id="sup-address" {...form.register("address")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {supplier ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
