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
import { categorySchema, type CategoryInput, type CategoryFormValues } from "../dto/menu.dto";
import { createCategoryAction, updateCategoryAction } from "../actions/menu.actions";

export interface CategoryRow {
  id: string;
  name: string;
  itemCount: number;
  sortOrder: number;
}

interface Props {
  open: boolean;
  category?: CategoryRow;
  onClose: () => void;
}

export function CategoryDialog({ open, category, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<CategoryFormValues, unknown, CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: "", description: "", sortOrder: 0, parentId: null },
  });

  useEffect(() => {
    if (open) {
      form.reset(
        category
          ? { name: category.name, description: "", sortOrder: category.sortOrder, parentId: null }
          : { name: "", description: "", sortOrder: 0, parentId: null },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category]);

  const onSubmit = (values: CategoryInput) =>
    startTransition(async () => {
      const result = category
        ? await updateCategoryAction(category.id, values)
        : await createCategoryAction(values);
      if (result.ok) {
        toast.success(category ? "Category updated" : "Category created");
        onClose();
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{category ? "Edit category" : "New category"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-sort">Sort order</Label>
            <Input id="cat-sort" type="number" min="0" {...form.register("sortOrder")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {category ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
