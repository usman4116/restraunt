"use client";

import { useState, useTransition, useEffect } from "react";
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
import { createZoneAction, updateZoneAction } from "../actions/delivery.actions";

export interface ZoneRow {
  id: string;
  name: string;
  deliveryFee: number;
  minOrderAmount: number;
  etaMinutes: number;
}

interface Props {
  open: boolean;
  zone?: ZoneRow;
  onClose: () => void;
}

export function ZoneDialog({ open, zone, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [minOrderAmount, setMinOrderAmount] = useState("0");
  const [etaMinutes, setEtaMinutes] = useState("45");

  useEffect(() => {
    if (!open) return;
    setName(zone?.name ?? "");
    setDeliveryFee(zone ? String(zone.deliveryFee) : "0");
    setMinOrderAmount(zone ? String(zone.minOrderAmount) : "0");
    setEtaMinutes(zone ? String(zone.etaMinutes) : "45");
  }, [open, zone]);

  const submit = () =>
    startTransition(async () => {
      const input = {
        name,
        deliveryFee: Number(deliveryFee),
        minOrderAmount: Number(minOrderAmount),
        etaMinutes: Number(etaMinutes),
      };
      const result = zone ? await updateZoneAction(zone.id, input) : await createZoneAction(input);
      if (result.ok) {
        toast.success(zone ? "Zone updated" : "Zone added");
        onClose();
        router.refresh();
      } else {
        toast.error(result.error.fields?.name || result.error.message);
      }
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{zone ? "Edit zone" : "Add delivery zone"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="z-name">Zone name *</Label>
            <Input
              id="z-name"
              placeholder="Downtown"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="z-fee">Delivery fee</Label>
              <Input
                id="z-fee"
                type="number"
                step="0.01"
                min="0"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="z-min">Min order</Label>
              <Input
                id="z-min"
                type="number"
                step="0.01"
                min="0"
                value={minOrderAmount}
                onChange={(e) => setMinOrderAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="z-eta">ETA (minutes)</Label>
            <Input
              id="z-eta"
              type="number"
              min="5"
              max="240"
              value={etaMinutes}
              onChange={(e) => setEtaMinutes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {zone ? "Update" : "Add zone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
