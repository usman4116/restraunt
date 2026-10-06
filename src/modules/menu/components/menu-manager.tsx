"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus, Search, Pencil, Trash2, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { deleteMenuItemAction, deleteCategoryAction } from "../actions/menu.actions";
import { MenuItemDialog, type MenuItemRow } from "./menu-item-dialog";
import { CategoryDialog, type CategoryRow } from "./category-dialog";
import { cn } from "@/lib/utils";

interface Props {
  categories: CategoryRow[];
  items: MenuItemRow[];
  total: number;
  page: number;
  pageSize: number;
}

const money = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });

export function MenuManager({ categories, items, total, page, pageSize }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const [itemDialog, setItemDialog] = useState<{ open: boolean; item?: MenuItemRow }>({ open: false });
  const [categoryDialog, setCategoryDialog] = useState<{ open: boolean; category?: CategoryRow }>({ open: false });

  const activeCategoryId = search.get("categoryId");
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(search.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    if (key !== "page") next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  };

  const removeItem = async (item: MenuItemRow) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    const result = await deleteMenuItemAction(item.id);
    if (result.ok) {
      toast.success("Item deleted");
      router.refresh();
    } else toast.error(result.error.message);
  };

  const removeCategory = async (category: CategoryRow) => {
    if (!confirm(`Delete category "${category.name}"? Items keep existing but lose visibility.`)) return;
    const result = await deleteCategoryAction(category.id);
    if (result.ok) {
      toast.success("Category deleted");
      router.refresh();
    } else toast.error(result.error.message);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Menu</h1>
          <p className="text-sm text-muted-foreground">{total} items across {categories.length} categories</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCategoryDialog({ open: true })}>
            <FolderPlus className="size-4" /> Category
          </Button>
          <Button onClick={() => setItemDialog({ open: true })}>
            <Plus className="size-4" /> New item
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search items…"
            className="w-64 pl-8"
            defaultValue={search.get("search") ?? ""}
            onKeyDown={(e) => {
              if (e.key === "Enter") setParam("search", (e.target as HTMLInputElement).value);
            }}
          />
        </div>
        <button
          onClick={() => setParam("categoryId", null)}
          className={cn(
            "rounded-full border px-3 py-1 text-sm transition-colors",
            !activeCategoryId ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
          )}
        >
          All
        </button>
        {categories.map((c) => (
          <span key={c.id} className="group relative inline-flex">
            <button
              onClick={() => setParam("categoryId", c.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                activeCategoryId === c.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "hover:bg-accent",
              )}
            >
              {c.name} <span className="text-muted-foreground">({c.itemCount})</span>
            </button>
            <span className="absolute -right-1 -top-1 hidden gap-0.5 group-hover:flex">
              <button
                aria-label={`Edit ${c.name}`}
                className="rounded-full border bg-background p-0.5 shadow-sm hover:text-primary"
                onClick={() => setCategoryDialog({ open: true, category: c })}
              >
                <Pencil className="size-3" />
              </button>
              <button
                aria-label={`Delete ${c.name}`}
                className="rounded-full border bg-background p-0.5 shadow-sm hover:text-destructive"
                onClick={() => removeCategory(c)}
              >
                <Trash2 className="size-3" />
              </button>
            </span>
          </span>
        ))}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Variants</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No menu items yet. Create your first item.
                </TableCell>
              </TableRow>
            )}
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="text-muted-foreground">{item.categoryName}</TableCell>
                <TableCell className="text-muted-foreground">{item.sku ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{money.format(item.basePrice)}</TableCell>
                <TableCell>
                  {item.variants.length ? (
                    <div className="flex flex-wrap gap-1">
                      {item.variants.map((v) => (
                        <Badge key={v.id ?? v.name} variant="secondary">{v.name}</Badge>
                      ))}
                    </div>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={item.status === "ACTIVE" ? "default" : "outline"}>{item.status}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost" size="icon" aria-label="Edit"
                      onClick={() => setItemDialog({ open: true, item })}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" aria-label="Delete"
                      className="text-destructive"
                      onClick={() => removeItem(item)}
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

      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">Page {page} of {pageCount}</span>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setParam("page", String(page - 1))}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setParam("page", String(page + 1))}>
            Next
          </Button>
        </div>
      )}

      <MenuItemDialog
        open={itemDialog.open}
        item={itemDialog.item}
        categories={categories}
        onClose={() => setItemDialog({ open: false })}
      />
      <CategoryDialog
        open={categoryDialog.open}
        category={categoryDialog.category}
        onClose={() => setCategoryDialog({ open: false })}
      />
    </div>
  );
}
