"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Bike, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { assignRiderAction, confirmDeliveryAction } from "../actions/delivery.actions";
import type { RiderRow } from "./rider-dialog";
import type { DeliveryRow } from "./delivery-manager";

interface Props {
  delivery?: DeliveryRow;
  riders: RiderRow[];
  mode: "assign" | "confirm";
  onClose: () => void;
}

export function DispatchDialog({ delivery, riders, mode, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [riderId, setRiderId] = useState("");
  const [otpCode, setOtpCode] = useState("");

  if (!delivery) return null;

  const assign = () =>
    startTransition(async () => {
      const result = await assignRiderAction({ deliveryId: delivery.id, riderId, riderEarning: 0 });
      if (result.ok) {
        toast.success(
          result.data.otpCode
            ? `Assigned. Give the customer code ${result.data.otpCode}.`
            : "Rider assigned",
        );
        onClose();
        router.refresh();
      } else toast.error(result.error.fields?.riderId || result.error.message);
    });

  const confirm = () =>
    startTransition(async () => {
      const result = await confirmDeliveryAction({ deliveryId: delivery.id, otpCode });
      if (result.ok) {
        toast.success("Delivery confirmed");
        setOtpCode("");
        onClose();
        router.refresh();
      } else toast.error(result.error.fields?.otpCode || result.error.message);
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "assign" ? "Assign a rider" : "Confirm delivery"}
          </DialogTitle>
          <DialogDescription>
            Order {delivery.orderNumber} · {delivery.address}
          </DialogDescription>
        </DialogHeader>

        {mode === "assign" ? (
          <div className="space-y-2">
            {riders.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No riders yet. Add one from the Riders tab.
              </p>
            )}
            {riders.map((rider) => (
              <button
                key={rider.id}
                type="button"
                disabled={!rider.isAvailable}
                onClick={() => setRiderId(rider.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors disabled:opacity-50",
                  riderId === rider.id ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                )}
              >
                <span className="flex items-center gap-2">
                  <Bike className="size-4 text-muted-foreground" aria-hidden />
                  <span>
                    <span className="font-medium">{rider.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {rider.vehicleType || "rider"} · {rider.phone}
                    </span>
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {!rider.isAvailable
                    ? "Unavailable"
                    : rider.openDeliveries > 0
                      ? `${rider.openDeliveries} in flight`
                      : "Free"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="d-otp">Customer OTP *</Label>
              <Input
                id="d-otp"
                inputMode="numeric"
                maxLength={4}
                placeholder="0000"
                className="text-center text-2xl tracking-[0.5em] tabular-nums"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
            </div>
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              The customer receives this code when the rider is assigned. A mismatch is recorded
              in the audit log.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {mode === "assign" ? (
            <Button onClick={assign} disabled={pending || !riderId}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Assign
            </Button>
          ) : (
            <Button onClick={confirm} disabled={pending || otpCode.length !== 4}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Confirm delivery
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
