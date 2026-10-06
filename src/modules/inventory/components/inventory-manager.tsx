"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus, Search, Pencil, Trash2, PackageMinus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { deleteInventoryItemAction } from "../actions/inventory.actions";
import { InventoryItemDialog, type InventoryRow } from "./inventory-item-dialog";
import { StockAdjustDialog } from "./stock-adjust-dialog";

interface Props {
  items: InventoryRow[];
  total: number;
  page: number;
  pageSize: number;
}

const money = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });
const qty = new Intl.NumberFormat("en", { maximumFractionDigits: 3 });

export function InventoryManager({ items, total, page, pageSize }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const [itemDialog, setItemDialog] = useState<{ open: boolean; item?: InventoryRow }>({ open: false });
  const [adjustDialog, setAdjustDialog] = useState<{ open: boolean; item?: InventoryRow }>({ open: false });

  const lowOnly = search.get("low") === "1";
  const lowCount = items.filter((i) => i.isLow).length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const totalValue = items.reduce((sum, i) => sum + i.stockValue, 0);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(search.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    if (key !== "page") next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  };

  const removeItem = async (item: InventoryRow) => {
    if (!confirm(`Delete "${item.name}"? The stock ledger is preserved.`)) return;
    const result = await deleteInventoryItemAction(item.id);
    if (result.ok) {
      toast.success("Item deleted");
      router.refresh();
    } else toast.error(result.error.message);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            {total} items · page value {money.format(totalValue)}
            {lowCount > 0 && (
              <span className="ml-2 font-medium text-destructive">{lowCount} low stock</span>
            )}
          </p>
        </div>
        <Button onClick={() => setItemDialog({ open: true })}>
          <Plus className="size-4" /> New item
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name or SKU…"
            className="w-64 pl-8"
            defaultValue={search.get("search") ?? ""}
            onKeyDown={(e) => {
              if (e.key === "Enter") setParam("search", (e.target as HTMLInputElement).value);
            }}
          />
        </div>
        <button
          onClick={() => setParam("low", lowOnly ? null : "1")}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
            lowOnly ? "border-destructive bg-destructive/10 text-destructive" : "hover:bg-accent",
          )}
        >
          <TriangleAlert className="size-3.5" /> Low stock only
        </button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">On hand</TableHead>
              <TableHead className="text-right">Reorder at</TableHead>
              <TableHead className="text-right">Avg cost</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  {lowOnly ? "Nothing is below its reorder level." : "No inventory items yet."}
                </TableCell>
              </TableRow>
            )}
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">
                  {item.name}
                  {item.categoryName && (
                    <span className="ml-2 text-xs text-muted-foreground">{item.categoryName}</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{item.sku}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {qty.format(item.onHand)} {item.unit}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {item.reorderLevel > 0 ? `${qty.format(item.reorderLevel)} ${item.unit}` : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{money.format(item.avgCost)}</TableCell>
                <TableCell className="text-right tabular-nums">{money.format(item.stockValue)}</TableCell>
                <TableCell>
                  {item.isLow ? (
                    <Badge variant="destructive">Low</Badge>
                  ) : (
                    <Badge variant="secondary">OK</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost" size="icon" aria-label="Adjust stock" title="Adjust stock"
                      onClick={() => setAdjustDialog({ open: true, item })}
                    >
                      <PackageMinus className="size-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" aria-label="Edit"
                      onClick={() => setItemDialog({ open: true, item })}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" aria-label="Delete" className="text-destructive"
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

      <InventoryItemDialog
        open={itemDialog.open}
        item={itemDialog.item}
        onClose={() => setItemDialog({ open: false })}
      />
      <StockAdjustDialog
        open={adjustDialog.open}
        item={adjustDialog.item}
        onClose={() => setAdjustDialog({ open: false })}
      />
    </div>
  );
}
