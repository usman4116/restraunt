"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { adjustLoyaltyAction } from "../actions/customer.actions";
import type { CustomerRow } from "./customer-dialog";

interface Props {
  open: boolean;
  customer?: CustomerRow;
  onClose: () => void;
}

const TYPES = [
  { value: "EARN", label: "Earn", hint: "Award points" },
  { value: "REDEEM", label: "Redeem", hint: "Use points" },
  { value: "ADJUST", label: "Adjust", hint: "Manual correction" },
] as const;

export function LoyaltyDialog({ open, customer, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust loyalty — {customer?.firstName}</DialogTitle>
        </DialogHeader>
        {open && customer && <LoyaltyForm customer={customer} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function LoyaltyForm({ customer, onClose }: { customer: CustomerRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("EARN");
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");

  const submit = () =>
    startTransition(async () => {
      const result = await adjustLoyaltyAction({
        customerId: customer.id,
        type,
        points: Number(points),
        note,
      });
      if (result.ok) {
        toast.success("Loyalty points updated");
        onClose();
        router.refresh();
      } else {
        toast.error(result.error.fields?.points ?? result.error.message);
      }
    });

  return (
    <>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Current balance: <span className="font-medium tabular-nums">{customer.loyaltyPoints} points</span>
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
          <Label htmlFor="loy-pts">Points</Label>
          <Input
            id="loy-pts"
            type="number"
            step="1"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="loy-note">Note</Label>
          <Input
            id="loy-note"
            placeholder="Reason…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending || !points || Number(points) === 0}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Apply
        </Button>
      </DialogFooter>
    </>
  );
}
