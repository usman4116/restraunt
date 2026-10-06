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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createReservationAction,
  updateReservationAction,
} from "../actions/reservation.actions";
import type { ReservationRow, TableOption } from "./reservations-manager";

interface Props {
  open: boolean;
  reservation?: ReservationRow;
  tables: TableOption[];
  defaultDate: string;
  onClose: () => void;
}

const NO_TABLE = "__none__";

/** Date → "YYYY-MM-DDTHH:mm" in local time, the format datetime-local expects. */
function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function ReservationDialog({ open, reservation, tables, defaultDate, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{reservation ? "Edit reservation" : "New reservation"}</DialogTitle>
        </DialogHeader>
        {open && (
          <ReservationForm
            reservation={reservation}
            tables={tables}
            defaultDate={defaultDate}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReservationForm({
  reservation,
  tables,
  defaultDate,
  onClose,
}: Omit<Props, "open">) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [partySize, setPartySize] = useState("2");
  const [reservedAt, setReservedAt] = useState(`${defaultDate}T19:00`);
  const [durationMin, setDurationMin] = useState("90");
  const [tableId, setTableId] = useState<string>(NO_TABLE);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (reservation) {
      setGuestName(reservation.guestName);
      setGuestPhone(reservation.guestPhone || "");
      setPartySize(String(reservation.partySize));
      setReservedAt(toLocalInput(new Date(reservation.reservedAt)));
      setDurationMin(String(reservation.durationMin));
      setTableId(reservation.tableId || NO_TABLE);
      setNotes(reservation.notes || "");
    }
  }, [reservation]);

  const size = Number(partySize) || 0;
  // Surface tables that cannot seat the party rather than hiding them.
  const tooSmall = tables.filter((t) => t.capacity < size).map((t) => t.id);

  const submit = () =>
    startTransition(async () => {
      const input = {
        guestName,
        guestPhone,
        partySize: size,
        reservedAt,
        durationMin: Number(durationMin),
        tableId: tableId === NO_TABLE ? "" : tableId,
        customerId: reservation?.customerId || "",
        notes,
      };
      const result = reservation
        ? await updateReservationAction(reservation.id, input)
        : await createReservationAction(input);
      if (result.ok) {
        toast.success(reservation ? "Reservation updated" : "Reservation booked");
        onClose();
        router.refresh();
      } else {
        const fields = result.error.fields;
        toast.error(fields?.tableId || fields?.partySize || result.error.message);
      }
    });

  return (
    <>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="r-name">Guest name *</Label>
            <Input
              id="r-name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="r-phone">Phone</Label>
            <Input
              id="r-phone"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="r-when">Date &amp; time *</Label>
            <Input
              id="r-when"
              type="datetime-local"
              value={reservedAt}
              onChange={(e) => setReservedAt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="r-duration">Duration (minutes)</Label>
            <Input
              id="r-duration"
              type="number"
              step="15"
              min="15"
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="r-party">Party size *</Label>
            <Input
              id="r-party"
              type="number"
              min="1"
              value={partySize}
              onChange={(e) => setPartySize(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="r-table">Table</Label>
            <Select value={tableId} onValueChange={(value) => setTableId(value ?? NO_TABLE)}>
              <SelectTrigger id="r-table">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TABLE}>Unassigned</SelectItem>
                {tables.map((table) => (
                  <SelectItem
                    key={table.id}
                    value={table.id}
                    disabled={tooSmall.includes(table.id)}
                  >
                    {table.name} · seats {table.capacity}
                    {tooSmall.includes(table.id) ? " (too small)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="r-notes">Notes</Label>
          <Textarea
            id="r-notes"
            rows={3}
            placeholder="Allergies, occasion, seating preference…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending || !guestName.trim() || size < 1}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {reservation ? "Update" : "Book"}
        </Button>
      </DialogFooter>
    </>
  );
}
