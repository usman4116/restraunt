"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  CalendarCheck,
  Users,
  UtensilsCrossed,
  UserX,
  LayoutGrid,
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
  deleteReservationAction,
  setReservationStatusAction,
} from "../actions/reservation.actions";
import { ReservationDialog } from "./reservation-dialog";
import { FloorPlan, type FloorSectionRow } from "./floor-plan";
import { TableDialog } from "./table-dialog";

export interface ReservationRow {
  id: string;
  guestName: string;
  guestPhone: string | null;
  partySize: number;
  reservedAt: Date | string;
  durationMin: number;
  status: string;
  notes: string | null;
  seatedAt: Date | string | null;
  tableId: string | null;
  tableName: string | null;
  customerId: string | null;
  loyaltyTier: string | null;
}

export interface TableOption {
  id: string;
  name: string;
  capacity: number;
}

interface Props {
  reservations: ReservationRow[];
  sections: FloorSectionRow[];
  summary: {
    total: number;
    pending: number;
    confirmed: number;
    seated: number;
    noShow: number;
    covers: number;
    totalTables: number;
    availableTables: number;
  };
  date: string;
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-700 dark:text-amber-500",
  CONFIRMED: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  SEATED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  COMPLETED: "bg-muted text-muted-foreground",
  NO_SHOW: "bg-red-500/15 text-red-700 dark:text-red-400",
  CANCELLED: "bg-muted text-muted-foreground line-through",
};

// Mirrors the service-side transition table so the UI only offers legal moves.
const NEXT_STATUS: Record<string, { value: string; label: string }[]> = {
  PENDING: [
    { value: "CONFIRMED", label: "Confirm" },
    { value: "SEATED", label: "Seat" },
    { value: "NO_SHOW", label: "No show" },
    { value: "CANCELLED", label: "Cancel" },
  ],
  CONFIRMED: [
    { value: "SEATED", label: "Seat" },
    { value: "NO_SHOW", label: "No show" },
    { value: "CANCELLED", label: "Cancel" },
  ],
  SEATED: [{ value: "COMPLETED", label: "Complete" }],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
};

const timeFormat = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" });

export function ReservationsManager({ reservations, sections, summary, date }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const [reservationDialog, setReservationDialog] = useState<{
    open: boolean;
    reservation?: ReservationRow;
  }>({ open: false });
  const [tableDialog, setTableDialog] = useState(false);

  const tables: TableOption[] = sections.flatMap((s) =>
    s.tables.map((t) => ({ id: t.id, name: t.name, capacity: t.capacity })),
  );

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(search.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  };

  const advance = async (reservation: ReservationRow, status: string) => {
    const result = await setReservationStatusAction({
      reservationId: reservation.id,
      status,
    });
    if (result.ok) {
      toast.success(`${reservation.guestName} → ${status.toLowerCase().replace(/_/g, " ")}`);
      router.refresh();
    } else toast.error(result.error.message);
  };

  const remove = async (reservation: ReservationRow) => {
    if (!confirm(`Delete the booking for "${reservation.guestName}"?`)) return;
    const result = await deleteReservationAction(reservation.id);
    if (result.ok) {
      toast.success("Reservation deleted");
      router.refresh();
    } else toast.error(result.error.message);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reservations</h1>
          <p className="text-sm text-muted-foreground">
            Bookings and live table status for the selected day
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTableDialog(true)}>
            <LayoutGrid className="size-4" /> Tables
          </Button>
          <Button onClick={() => setReservationDialog({ open: true })}>
            <Plus className="size-4" /> New reservation
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Bookings"
          value={String(summary.total)}
          hint={`${summary.pending} pending · ${summary.confirmed} confirmed`}
          icon={CalendarCheck}
        />
        <StatTile
          label="Covers"
          value={String(summary.covers)}
          hint="Guests expected today"
          icon={Users}
        />
        <StatTile
          label="Seated now"
          value={String(summary.seated)}
          hint="Currently dining"
          icon={UtensilsCrossed}
        />
        <StatTile
          label="Tables free"
          value={`${summary.availableTables}/${summary.totalTables}`}
          hint={summary.noShow > 0 ? `${summary.noShow} no-shows today` : "All tracked"}
          icon={summary.noShow > 0 ? UserX : LayoutGrid}
          tone={summary.noShow > 0 ? "warning" : "default"}
        />
      </div>

      <Tabs defaultValue="bookings">
        <TabsList>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="floor">Floor plan</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings" className="space-y-3">
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
                placeholder="Search guest…"
                className="w-64 pl-8"
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
                  <TableHead>Time</TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead className="text-right">Party</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-64" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      No reservations for this day.
                    </TableCell>
                  </TableRow>
                )}
                {reservations.map((reservation) => (
                  <TableRow key={reservation.id}>
                    <TableCell className="tabular-nums">
                      {timeFormat.format(new Date(reservation.reservedAt))}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {reservation.durationMin}m
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">
                      {reservation.guestName}
                      {reservation.loyaltyTier && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          {reservation.loyaltyTier}
                        </Badge>
                      )}
                      {reservation.guestPhone && (
                        <div className="text-xs font-normal text-muted-foreground">
                          {reservation.guestPhone}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {reservation.partySize}
                    </TableCell>
                    <TableCell className="text-sm">
                      {reservation.tableName ?? (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          STATUS_STYLES[reservation.status] ?? "bg-muted",
                        )}
                      >
                        {reservation.status.replace(/_/g, " ").toLowerCase()}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-40 truncate text-sm text-muted-foreground">
                      {reservation.notes || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {NEXT_STATUS[reservation.status]?.map((option) => (
                          <Button
                            key={option.value}
                            size="sm"
                            variant="outline"
                            onClick={() => advance(reservation, option.value)}
                          >
                            {option.label}
                          </Button>
                        ))}
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Edit"
                          onClick={() => setReservationDialog({ open: true, reservation })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Delete"
                          onClick={() => remove(reservation)}
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

        <TabsContent value="floor">
          <FloorPlan sections={sections} />
        </TabsContent>
      </Tabs>

      <ReservationDialog
        open={reservationDialog.open}
        reservation={reservationDialog.reservation}
        tables={tables}
        defaultDate={date}
        onClose={() => setReservationDialog({ open: false })}
      />
      <TableDialog
        open={tableDialog}
        sections={sections}
        onClose={() => setTableDialog(false)}
      />
    </div>
  );
}
