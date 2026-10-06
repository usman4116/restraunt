"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPurchaseOrderAction } from "../actions/purchasing.actions";
import type { SupplierRow, ItemOption } from "./purchasing-manager";

interface LineState {
  inventoryItemId: string;
  quantity: string;
  unitCost: string;
}

interface Props {
  open: boolean;
  suppliers: SupplierRow[];
  items: ItemOption[];
  onClose: () => void;
}

const money = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });
const emptyLine = (): LineState => ({ inventoryItemId: "", quantity: "", unitCost: "" });

export function PurchaseOrderDialog({ open, suppliers, items, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New purchase order</DialogTitle>
        </DialogHeader>
        {open && <PoForm suppliers={suppliers} items={items} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

// Mounted fresh each time the dialog opens, so state needs no reset effect.
function PoForm({
  suppliers,
  items,
  onClose,
}: {
  suppliers: SupplierRow[];
  items: ItemOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);

  const itemById = new Map(items.map((i) => [i.id, i]));

  const setLine = (index: number, patch: Partial<LineState>) =>
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        const next = { ...l, ...patch };
        // Default the cost to the item's last purchase cost when picking an item
        if (patch.inventoryItemId && !l.unitCost) {
          const item = itemById.get(patch.inventoryItemId);
          if (item && item.lastCost > 0) next.unitCost = String(item.lastCost);
        }
        return next;
      }),
    );

  const total = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0),
    0,
  );

  const submit = () =>
    startTransition(async () => {
      const result = await createPurchaseOrderAction({
        supplierId,
        expectedDate,
        notes,
        lines: lines
          .filter((l) => l.inventoryItemId)
          .map((l) => ({
            inventoryItemId: l.inventoryItemId,
            quantity: Number(l.quantity),
            unitCost: Number(l.unitCost) || 0,
            taxRate: 0,
          })),
      });
      if (result.ok) {
        toast.success("Purchase order created");
        onClose();
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });

  return (
    <>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="po-supplier">Supplier</Label>
            <select
              id="po-supplier"
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="po-date">Expected delivery</Label>
            <Input
              id="po-date" type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Lines</Label>
            <Button
              type="button" variant="outline" size="sm"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              <Plus className="size-4" /> Add line
            </Button>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => {
              const item = itemById.get(l.inventoryItemId);
              return (
                <div key={i} className="grid grid-cols-[1fr_110px_110px_90px_36px] items-center gap-2">
                  <select
                    aria-label="Item"
                    className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
                    value={l.inventoryItemId}
                    onChange={(e) => setLine(i, { inventoryItemId: e.target.value })}
                  >
                    <option value="">Select item…</option>
                    {items.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name} ({opt.unit})
                      </option>
                    ))}
                  </select>
                  <Input
                    aria-label="Quantity" type="number" step="0.001" min="0"
                    placeholder={item ? `Qty (${item.unit})` : "Qty"}
                    value={l.quantity}
                    onChange={(e) => setLine(i, { quantity: e.target.value })}
                  />
                  <Input
                    aria-label="Unit cost" type="number" step="0.01" min="0"
                    placeholder="Unit cost"
                    value={l.unitCost}
                    onChange={(e) => setLine(i, { unitCost: e.target.value })}
                  />
                  <span className="text-right text-sm tabular-nums text-muted-foreground">
                    {Number(l.quantity) > 0 && Number(l.unitCost) > 0
                      ? money.format(Number(l.quantity) * Number(l.unitCost))
                      : "—"}
                  </span>
                  <Button
                    type="button" variant="ghost" size="icon" aria-label="Remove line"
                    className="text-destructive"
                    onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="po-notes">Notes</Label>
          <Input
            id="po-notes" placeholder="Delivery instructions…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="rounded-md border bg-muted/40 px-3 py-2 text-right text-sm font-medium">
          Total {money.format(total)}
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          onClick={submit}
          disabled={
            pending ||
            !supplierId ||
            !lines.some((l) => l.inventoryItemId && Number(l.quantity) > 0)
          }
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Create order
        </Button>
      </DialogFooter>
    </>
  );
}
