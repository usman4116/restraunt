"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Truck,
  PackageCheck,
  Bike,
  Wallet,
  MapPin,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  setDeliveryStatusAction,
  deleteRiderAction,
  deleteZoneAction,
} from "../actions/delivery.actions";
import { RiderDialog, type RiderRow } from "./rider-dialog";
import { ZoneDialog, type ZoneRow } from "./zone-dialog";
import { DispatchDialog } from "./dispatch-dialog";

export interface DeliveryRow {
  id: string;
  orderId: string;
  orderNumber: string;
  orderTotal: number;
  customerName: string | null;
  customerPhone: string | null;
  address: string;
  deliveryStatus: string;
  riderId: string | null;
  riderName: string | null;
  riderPhone: string | null;
  zoneId: string | null;
  zoneName: string | null;
  etaMinutes: number | null;
  riderEarning: number;
  assignedAt: Date | string | null;
  pickedUpAt: Date | string | null;
  deliveredAt: Date | string | null;
  createdAt: Date | string;
  otpCode: string | null;
}

interface Props {
  deliveries: DeliveryRow[];
  riders: RiderRow[];
  zones: ZoneRow[];
  summary: {
    total: number;
    pending: number;
    inFlight: number;
    delivered: number;
    failed: number;
    payout: number;
    ridersAvailable: number;
    ridersTotal: number;
  };
  date: string;
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-700 dark:text-amber-500",
  ASSIGNED: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  PICKED_UP: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
  IN_TRANSIT: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  DELIVERED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  FAILED: "bg-red-500/15 text-red-700 dark:text-red-400",
  RETURNED: "bg-muted text-muted-foreground",
};

// Mirrors the service transition table, minus DELIVERED — that needs the OTP.
const NEXT_STATUS: Record<string, { value: string; label: string }[]> = {
  PENDING: [{ value: "FAILED", label: "Fail" }],
  ASSIGNED: [
    { value: "PICKED_UP", label: "Picked up" },
    { value: "PENDING", label: "Unassign" },
  ],
  PICKED_UP: [{ value: "IN_TRANSIT", label: "In transit" }],
  IN_TRANSIT: [{ value: "FAILED", label: "Fail" }],
  DELIVERED: [],
  FAILED: [{ value: "RETURNED", label: "Returned" }],
  RETURNED: [],
};

const money = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });
const timeFormat = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" });

export function DeliveryManager({ deliveries, riders, zones, summary, date }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const [dispatch, setDispatch] = useState<{
    delivery?: DeliveryRow;
    mode: "assign" | "confirm";
  } | null>(null);
  const [riderDialog, setRiderDialog] = useState<{ open: boolean; rider?: RiderRow }>({
    open: false,
  });
  const [zoneDialog, setZoneDialog] = useState<{ open: boolean; zone?: ZoneRow }>({ open: false });

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(search.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  };

  const advance = async (delivery: DeliveryRow, deliveryStatus: string) => {
    const result = await setDeliveryStatusAction({ deliveryId: delivery.id, deliveryStatus });
    if (result.ok) {
      toast.success(`${delivery.orderNumber} → ${deliveryStatus.toLowerCase().replace(/_/g, " ")}`);
      router.refresh();
    } else toast.error(result.error.message);
  };

  const removeRider = async (rider: RiderRow) => {
    if (!confirm(`Remove rider "${rider.name}"?`)) return;
    const result = await deleteRiderAction(rider.id);
    if (result.ok) {
      toast.success("Rider removed");
      router.refresh();
    } else toast.error(result.error.message);
  };

  const removeZone = async (zone: ZoneRow) => {
    if (!confirm(`Remove zone "${zone.name}"?`)) return;
    const result = await deleteZoneAction(zone.id);
    if (result.ok) {
      toast.success("Zone removed");
      router.refresh();
    } else toast.error(result.error.message);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Delivery</h1>
          <p className="text-sm text-muted-foreground">
            Dispatch riders, track runs and confirm handovers
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Runs today"
          value={String(summary.total)}
          hint={`${summary.pending} awaiting a rider`}
          icon={Truck}
          tone={summary.pending > 0 ? "warning" : "default"}
        />
        <StatTile
          label="In flight"
          value={String(summary.inFlight)}
          hint="Assigned or on the road"
          icon={Bike}
        />
        <StatTile
          label="Delivered"
          value={String(summary.delivered)}
          hint={summary.failed > 0 ? `${summary.failed} failed or returned` : "No failures"}
          icon={summary.failed > 0 ? AlertTriangle : PackageCheck}
          tone={summary.failed > 0 ? "critical" : "default"}
        />
        <StatTile
          label="Rider payout"
          value={money.format(summary.payout)}
          hint={`${summary.ridersAvailable}/${summary.ridersTotal} riders available`}
          icon={Wallet}
        />
      </div>

      <Tabs defaultValue="runs">
        <TabsList>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="riders">Riders</TabsTrigger>
          <TabsTrigger value="zones">Zones</TabsTrigger>
        </TabsList>

        <TabsContent value="runs" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              className="w-44"
              value={date}
              onChange={(e) => setParam("date", e.target.value)}
            />
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search order or address…"
                className="w-72 pl-8"
                defaultValue={search.get("search") ?? ""}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setParam("search", (e.target as HTMLInputElement).value);
                }}
              />
            </div>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Rider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Earning</TableHead>
                  <TableHead className="w-72" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      No delivery runs for this day.
                    </TableCell>
                  </TableRow>
                )}
                {deliveries.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell className="font-medium">
                      {delivery.orderNumber}
                      <div className="text-xs font-normal text-muted-foreground">
                        {money.format(delivery.orderTotal)} ·{" "}
                        {timeFormat.format(new Date(delivery.createdAt))}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-64 text-sm">
                      <span className="flex items-start gap-1.5">
                        <MapPin
                          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <span className="truncate">{delivery.address}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {delivery.customerName ?? "Guest"}
                        {delivery.zoneName ? ` · ${delivery.zoneName}` : ""}
                        {delivery.etaMinutes ? ` · ${delivery.etaMinutes}m ETA` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {delivery.riderName ?? (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                      {delivery.otpCode && (
                        <Badge variant="outline" className="ml-2 tabular-nums">
                          OTP {delivery.otpCode}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          STATUS_STYLES[delivery.deliveryStatus] ?? "bg-muted",
                        )}
                      >
                        {delivery.deliveryStatus.replace(/_/g, " ").toLowerCase()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(delivery.riderEarning)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {delivery.deliveryStatus === "PENDING" && (
                          <Button
                            size="sm"
                            onClick={() => setDispatch({ delivery, mode: "assign" })}
                          >
                            Assign
                          </Button>
                        )}
                        {(delivery.deliveryStatus === "PICKED_UP" ||
                          delivery.deliveryStatus === "IN_TRANSIT") && (
                          <Button
                            size="sm"
                            onClick={() => setDispatch({ delivery, mode: "confirm" })}
                          >
                            Confirm OTP
                          </Button>
                        )}
                        {NEXT_STATUS[delivery.deliveryStatus]?.map((option) => (
                          <Button
                            key={option.value}
                            size="sm"
                            variant="outline"
                            onClick={() => advance(delivery, option.value)}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="riders" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setRiderDialog({ open: true })}>
              <Plus className="size-4" /> Add rider
            </Button>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rider</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Runs</TableHead>
                  <TableHead className="text-right">Earned</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {riders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      No riders yet.
                    </TableCell>
                  </TableRow>
                )}
                {riders.map((rider) => (
                  <TableRow key={rider.id}>
                    <TableCell className="font-medium">
                      {rider.name}
                      <div className="text-xs font-normal text-muted-foreground">
                        {rider.phone}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {rider.vehicleType || "—"}
                      {rider.vehicleNumber ? ` · ${rider.vehicleNumber}` : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant={rider.isFree ? "default" : "outline"}>
                        {!rider.isAvailable
                          ? "Unavailable"
                          : rider.openDeliveries > 0
                            ? `${rider.openDeliveries} in flight`
                            : "Free"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {rider.completedRuns}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(rider.totalEarned)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Edit"
                          onClick={() => setRiderDialog({ open: true, rider })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Remove"
                          onClick={() => removeRider(rider)}
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
        </TabsContent>

        <TabsContent value="zones" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setZoneDialog({ open: true })}>
              <Plus className="size-4" /> Add zone
            </Button>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zone</TableHead>
                  <TableHead className="text-right">Delivery fee</TableHead>
                  <TableHead className="text-right">Min order</TableHead>
                  <TableHead className="text-right">ETA</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {zones.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      No delivery zones yet.
                    </TableCell>
                  </TableRow>
                )}
                {zones.map((zone) => (
                  <TableRow key={zone.id}>
                    <TableCell className="font-medium">{zone.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(zone.deliveryFee)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(zone.minOrderAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {zone.etaMinutes}m
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Edit"
                          onClick={() => setZoneDialog({ open: true, zone })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Remove"
                          onClick={() => removeZone(zone)}
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
        </TabsContent>
      </Tabs>

      {dispatch && (
        <DispatchDialog
          delivery={dispatch.delivery}
          riders={riders}
          mode={dispatch.mode}
          onClose={() => setDispatch(null)}
        />
      )}
      <RiderDialog
        open={riderDialog.open}
        rider={riderDialog.rider}
        onClose={() => setRiderDialog({ open: false })}
      />
      <ZoneDialog
        open={zoneDialog.open}
        zone={zoneDialog.zone}
        onClose={() => setZoneDialog({ open: false })}
      />
    </div>
  );
}
