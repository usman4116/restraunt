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
import { receiveGoodsAction } from "../actions/purchasing.actions";
import type { PoRow } from "./purchasing-manager";

interface Props {
  open: boolean;
  po?: PoRow;
  onClose: () => void;
}

const outstandingOf = (l: { quantity: number; receivedQty: number }) =>
  Math.max(0, Math.round((l.quantity - l.receivedQty) * 1000) / 1000);

export function ReceiveGoodsDialog({ open, po, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Receive goods — {po?.poNumber}</DialogTitle>
        </DialogHeader>
        {open && po && <ReceiveForm po={po} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

// Mounted fresh each time the dialog opens, so state needs no reset effect.
function ReceiveForm({ po, onClose }: { po: PoRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Pre-fill each line with the outstanding quantity
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(po.items.map((l) => [l.id, String(outstandingOf(l))])),
  );
  const [notes, setNotes] = useState("");

  const submit = () =>
    startTransition(async () => {
      const result = await receiveGoodsAction({
        purchaseOrderId: po.id,
        notes,
        lines: po.items.map((l) => ({
          purchaseOrderItemId: l.id,
          receivedQty: Number(quantities[l.id]) || 0,
        })),
      });
      if (result.ok) {
        toast.success("Goods received — stock and costs updated");
        onClose();
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });

  const anyQty = po.items.some((l) => (Number(quantities[l.id]) || 0) > 0);

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-2">
          {po.items.map((l) => {
            const outstanding = outstandingOf(l);
            return (
              <div key={l.id} className="grid grid-cols-[1fr_130px] items-center gap-2">
                <div className="text-sm">
                  <p className="font-medium">{l.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Ordered {l.quantity} {l.unit}
                    {l.receivedQty > 0 && ` · received ${l.receivedQty}`}
                    {` · outstanding ${outstanding}`}
                  </p>
                </div>
                <Input
                  aria-label={`Received quantity for ${l.name}`}
                  type="number" step="0.001" min="0" max={outstanding}
                  value={quantities[l.id] ?? ""}
                  onChange={(e) =>
                    setQuantities((prev) => ({ ...prev, [l.id]: e.target.value }))
                  }
                />
              </div>
            );
          })}
        </div>

        <div className="space-y-2">
          <Label htmlFor="gr-notes">Notes</Label>
          <Input
            id="gr-notes" placeholder="Delivery note reference…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Receiving updates stock levels and recalculates weighted-average costs.
          Partial receipts keep the order open.
        </p>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={pending || !anyQty}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Receive
        </Button>
      </DialogFooter>
    </>
  );
}
