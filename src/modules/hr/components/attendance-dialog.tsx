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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { markAttendanceAction } from "../actions/hr.actions";
import { ATTENDANCE_STATUSES } from "../dto/hr.dto";
import type { EmployeeRow } from "./employee-dialog";

interface Props {
  open: boolean;
  employees: EmployeeRow[];
  defaultDate: string;
  onClose: () => void;
}

export function AttendanceDialog({ open, employees, defaultDate, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [attStatus, setAttStatus] = useState<string>("PRESENT");
  const [clockIn, setClockIn] = useState("09:00");
  const [clockOut, setClockOut] = useState("17:00");
  const [note, setNote] = useState("");

  // Only worked days carry clock times; leave and holidays do not.
  const tracksHours = ["PRESENT", "LATE", "HALF_DAY"].includes(attStatus);

  const submit = () =>
    startTransition(async () => {
      const result = await markAttendanceAction({
        employeeId,
        date,
        attStatus,
        clockIn: tracksHours ? clockIn : "",
        clockOut: tracksHours ? clockOut : "",
        note,
      });
      if (result.ok) {
        toast.success("Attendance marked");
        setNote("");
        onClose();
        router.refresh();
      } else {
        toast.error(result.error.fields?.employeeId || result.error.message);
      }
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark attendance</DialogTitle>
          <DialogDescription>
            Marking the same employee and day again overwrites the existing record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="a-emp">Employee *</Label>
            <Select value={employeeId} onValueChange={(value) => setEmployeeId(value ?? "")}>
              <SelectTrigger id="a-emp">
                <SelectValue placeholder="Pick an employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.fullName} · {employee.employeeCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="a-date">Date *</Label>
              <Input
                id="a-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="a-status">Status *</Label>
              <Select value={attStatus} onValueChange={(value) => setAttStatus(value ?? "PRESENT")}>
                <SelectTrigger id="a-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ATTENDANCE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.replace(/_/g, " ").toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {tracksHours && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="a-in">Clock in</Label>
                <Input
                  id="a-in"
                  type="time"
                  value={clockIn}
                  onChange={(e) => setClockIn(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-out">Clock out</Label>
                <Input
                  id="a-out"
                  type="time"
                  value={clockOut}
                  onChange={(e) => setClockOut(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="a-note">Note</Label>
            <Textarea
              id="a-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !employeeId || !date}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Mark
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
