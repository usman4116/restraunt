"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { menuItemSchema, type MenuItemInput, type MenuItemFormValues } from "../dto/menu.dto";
import { createMenuItemAction, updateMenuItemAction } from "../actions/menu.actions";
import type { CategoryRow } from "./category-dialog";

export interface MenuItemRow {
  id: string;
  name: string;
  sku: string | null;
  categoryId: string;
  categoryName: string;
  basePrice: number;
  taxRate: number;
  status: string;
  allergens: string[];
  tags: string[];
  description: string | null;
  prepTimeMinutes: number | null;
  variants: { id?: string; name: string; priceDelta: number; isDefault: boolean }[];
}

interface Props {
  open: boolean;
  item?: MenuItemRow;
  categories: CategoryRow[];
  onClose: () => void;
}

export function MenuItemDialog({ open, item, categories, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<MenuItemFormValues, unknown, MenuItemInput>({
    resolver: zodResolver(menuItemSchema),
    defaultValues: emptyValues(),
  });
  const variants = useFieldArray({ control: form.control, name: "variants" });

  useEffect(() => {
    if (open) {
      form.reset(
        item
          ? {
              name: item.name,
              categoryId: item.categoryId,
              description: item.description ?? "",
              sku: item.sku ?? "",
              basePrice: item.basePrice,
              taxRate: item.taxRate,
              prepTimeMinutes: item.prepTimeMinutes,
              allergens: item.allergens,
              tags: item.tags,
              variants: item.variants,
            }
          : emptyValues(),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item]);

  const errors = form.formState.errors;

  const onSubmit = (values: MenuItemInput) =>
    startTransition(async () => {
      const result = item
        ? await updateMenuItemAction(item.id, values)
        : await createMenuItemAction(values);
      if (result.ok) {
        toast.success(item ? "Item updated" : "Item created");
        onClose();
        router.refresh();
      } else {
        toast.error(result.error.message);
        for (const [field, message] of Object.entries(result.error.fields ?? {})) {
          form.setError(field as keyof MenuItemInput, { message });
        }
      }
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Edit menu item" : "New menu item"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="mi-name">Name</Label>
            <Input id="mi-name" {...form.register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={form.watch("categoryId") || undefined}
                onValueChange={(v) => v && form.setValue("categoryId", v, { shouldValidate: true })}
              >
                <SelectTrigger><SelectValue placeholder="Pick category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.categoryId && (
                <p className="text-sm text-destructive">{errors.categoryId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="mi-sku">SKU</Label>
              <Input id="mi-sku" {...form.register("sku")} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="mi-price">Price</Label>
              <Input id="mi-price" type="number" step="0.01" min="0" {...form.register("basePrice")} />
              {errors.basePrice && (
                <p className="text-sm text-destructive">{errors.basePrice.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="mi-tax">Tax %</Label>
              <Input id="mi-tax" type="number" step="0.01" min="0" {...form.register("taxRate")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mi-prep">Prep (min)</Label>
              <Input id="mi-prep" type="number" min="0" {...form.register("prepTimeMinutes")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mi-desc">Description</Label>
            <Textarea id="mi-desc" rows={2} {...form.register("description")} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Variants</Label>
              <Button
                type="button" variant="outline" size="sm"
                onClick={() => variants.append({ name: "", priceDelta: 0, isDefault: false })}
              >
                <Plus className="size-3.5" /> Add
              </Button>
            </div>
            {variants.fields.map((field, i) => (
              <div key={field.id} className="flex items-center gap-2">
                <Input placeholder="Name (e.g. Large)" {...form.register(`variants.${i}.name`)} />
                <Input
                  placeholder="+/- price" type="number" step="0.01" className="w-28"
                  {...form.register(`variants.${i}.priceDelta`)}
                />
                <Button
                  type="button" variant="ghost" size="icon" aria-label="Remove variant"
                  onClick={() => variants.remove(i)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {item ? "Save changes" : "Create item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function emptyValues(): MenuItemInput {
  return {
    name: "",
    categoryId: "",
    description: "",
    sku: "",
    basePrice: 0,
    taxRate: 0,
    prepTimeMinutes: null,
    allergens: [],
    tags: [],
    variants: [],
  };
}
