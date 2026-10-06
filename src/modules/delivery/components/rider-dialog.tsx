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
import { Switch } from "@/components/ui/switch";
import { createRiderAction, updateRiderAction } from "../actions/delivery.actions";

export interface RiderRow {
  id: string;
  name: string;
  phone: string;
  vehicleType: string | null;
  vehicleNumber: string | null;
  isAvailable: boolean;
  openDeliveries: number;
  isFree: boolean;
  completedRuns: number;
  totalEarned: number;
}

interface Props {
  open: boolean;
  rider?: RiderRow;
  onClose: () => void;
}

export function RiderDialog({ open, rider, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(rider?.name ?? "");
    setPhone(rider?.phone ?? "");
    setVehicleType(rider?.vehicleType ?? "");
    setVehicleNumber(rider?.vehicleNumber ?? "");
    setIsAvailable(rider?.isAvailable ?? true);
  }, [open, rider]);

  const submit = () =>
    startTransition(async () => {
      const input = { name, phone, vehicleType, vehicleNumber, isAvailable };
      const result = rider
        ? await updateRiderAction(rider.id, input)
        : await createRiderAction(input);
      if (result.ok) {
        toast.success(rider ? "Rider updated" : "Rider added");
        onClose();
        router.refresh();
      } else {
        const fields = result.error.fields;
        toast.error(fields?.name || fields?.phone || result.error.message);
      }
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{rider ? "Edit rider" : "Add rider"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="rd-name">Name *</Label>
              <Input id="rd-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rd-phone">Phone *</Label>
              <Input id="rd-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="rd-vtype">Vehicle</Label>
              <Input
                id="rd-vtype"
                placeholder="bike"
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rd-vnum">Plate number</Label>
              <Input
                id="rd-vnum"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="rd-avail">Available for dispatch</Label>
              <p className="text-xs text-muted-foreground">
                Unavailable riders cannot be assigned new runs.
              </p>
            </div>
            <Switch id="rd-avail" checked={isAvailable} onCheckedChange={setIsAvailable} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim() || !phone.trim()}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {rider ? "Update" : "Add rider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
