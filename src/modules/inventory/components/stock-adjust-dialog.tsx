"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { adjustStockAction } from "../actions/inventory.actions";
import type { InventoryRow } from "./inventory-item-dialog";

interface Props {
  open: boolean;
  item?: InventoryRow;
  onClose: () => void;
}

const TYPES = [
  { value: "ADJUSTMENT", label: "Adjustment", hint: "Correct the count (+/-)" },
  { value: "WASTE", label: "Waste", hint: "Discarded during prep" },
  { value: "SPOILAGE", label: "Spoilage", hint: "Expired / unusable" },
] as const;

export function StockAdjustDialog({ open, item, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust stock — {item?.name}</DialogTitle>
        </DialogHeader>
        {open && item && <AdjustForm item={item} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

// Mounted fresh each time the dialog opens, so state needs no reset effect.
function AdjustForm({ item, onClose }: { item: InventoryRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("ADJUSTMENT");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");

  const submit = () =>
    startTransition(async () => {
      const result = await adjustStockAction({
        inventoryItemId: item.id,
        type,
        quantity: Number(quantity),
        note,
      });
      if (result.ok) {
        toast.success("Stock updated");
        onClose();
        router.refresh();
      } else {
        toast.error(result.error.fields?.quantity ?? result.error.message);
      }
    });

  return (
    <>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          On hand: <span className="font-medium tabular-nums">{item.onHand} {item.unit}</span>
        </p>
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              title={t.hint}
              className={cn(
                "rounded-md border px-2 py-1.5 text-xs font-medium",
                type === t.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <Label htmlFor="adj-qty">
            Quantity ({item.unit}){type === "ADJUSTMENT" ? " — use negative to remove" : ""}
          </Label>
          <Input
            id="adj-qty" type="number" step="0.001"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="adj-note">Note</Label>
          <Input
            id="adj-note" placeholder="Reason…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={pending || !quantity || Number(quantity) === 0}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Apply
        </Button>
      </DialogFooter>
    </>
  );
}
