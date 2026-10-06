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
  inventoryItemSchema,
  type InventoryItemInput,
  type InventoryItemFormValues,
} from "../dto/inventory.dto";
import {
  createInventoryItemAction,
  updateInventoryItemAction,
} from "../actions/inventory.actions";

export interface InventoryRow {
  id: string;
  name: string;
  sku: string;
  categoryName: string | null;
  unit: string;
  onHand: number;
  reorderLevel: number;
  reorderQty: number;
  avgCost: number;
  lastCost: number;
  stockValue: number;
  isLow: boolean;
}

interface Props {
  open: boolean;
  item?: InventoryRow;
  onClose: () => void;
}

export function InventoryItemDialog({ open, item, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<InventoryItemFormValues, unknown, InventoryItemInput>({
    resolver: zodResolver(inventoryItemSchema),
    defaultValues: empty(),
  });
  const errors = form.formState.errors;

  useEffect(() => {
    if (open) {
      form.reset(
        item
          ? {
              name: item.name,
              sku: item.sku,
              categoryName: item.categoryName ?? "",
              unit: item.unit,
              reorderLevel: item.reorderLevel,
              reorderQty: item.reorderQty,
              lastCost: item.lastCost,
              shelfLifeDays: null,
            }
          : empty(),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item]);

  const onSubmit = (values: InventoryItemInput) =>
    startTransition(async () => {
      const result = item
        ? await updateInventoryItemAction(item.id, values)
        : await createInventoryItemAction(values);
      if (result.ok) {
        toast.success(item ? "Item updated" : "Item created");
        onClose();
        router.refresh();
      } else {
        toast.error(result.error.message);
        for (const [field, message] of Object.entries(result.error.fields ?? {})) {
          form.setError(field as keyof InventoryItemFormValues, { message });
        }
      }
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? "Edit inventory item" : "New inventory item"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="inv-name">Name</Label>
            <Input id="inv-name" {...form.register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="inv-sku">SKU</Label>
              <Input id="inv-sku" {...form.register("sku")} />
              {errors.sku && <p className="text-sm text-destructive">{errors.sku.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-unit">Unit</Label>
              <Input id="inv-unit" placeholder="kg / L / pcs" {...form.register("unit")} />
              {errors.unit && <p className="text-sm text-destructive">{errors.unit.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-cat">Category</Label>
              <Input id="inv-cat" placeholder="Produce" {...form.register("categoryName")} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="inv-reorder">Reorder level</Label>
              <Input id="inv-reorder" type="number" step="0.001" min="0" {...form.register("reorderLevel")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-reorderqty">Reorder qty</Label>
              <Input id="inv-reorderqty" type="number" step="0.001" min="0" {...form.register("reorderQty")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-cost">Unit cost</Label>
              <Input id="inv-cost" type="number" step="0.01" min="0" {...form.register("lastCost")} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {item ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function empty(): InventoryItemFormValues {
  return {
    name: "", sku: "", categoryName: "", unit: "",
    reorderLevel: 0, reorderQty: 0, lastCost: 0, shelfLifeDays: null,
  };
}
