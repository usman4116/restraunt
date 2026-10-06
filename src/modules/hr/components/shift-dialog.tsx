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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createShiftAction, assignShiftAction } from "../actions/hr.actions";
import type { EmployeeRow } from "./employee-dialog";

export interface ShiftRow {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

interface Props {
  mode: "create" | "assign";
  employees: EmployeeRow[];
  shifts: ShiftRow[];
  defaultDate: string;
  onClose: () => void;
}

export function ShiftDialog({ mode, employees, shifts, defaultDate, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");

  const [employeeId, setEmployeeId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [date, setDate] = useState(defaultDate);

  const submit = () =>
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createShiftAction({ name, startTime, endTime })
          : await assignShiftAction({ employeeId, shiftId, date });
      if (result.ok) {
        toast.success(mode === "create" ? "Shift created" : "Shift assigned");
        onClose();
        router.refresh();
      } else {
        const fields = result.error.fields;
        toast.error(
          fields?.name || fields?.employeeId || fields?.shiftId || result.error.message,
        );
      }
    });

  const ready =
    mode === "create"
      ? Boolean(name.trim() && startTime && endTime)
      : Boolean(employeeId && shiftId && date);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New shift" : "Assign shift"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Shifts crossing midnight are supported — set an end time earlier than the start."
              : "Assigning the same employee, shift and day again is a no-op."}
          </DialogDescription>
        </DialogHeader>

        {mode === "create" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="s-name">Shift name *</Label>
              <Input
                id="s-name"
                placeholder="Morning"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="s-start">Starts *</Label>
                <Input
                  id="s-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-end">Ends *</Label>
                <Input
                  id="s-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="s-emp">Employee *</Label>
              <Select value={employeeId} onValueChange={(value) => setEmployeeId(value ?? "")}>
                <SelectTrigger id="s-emp">
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
            <div className="space-y-2">
              <Label htmlFor="s-shift">Shift *</Label>
              <Select value={shiftId} onValueChange={(value) => setShiftId(value ?? "")}>
                <SelectTrigger id="s-shift">
                  <SelectValue placeholder="Pick a shift" />
                </SelectTrigger>
                <SelectContent>
                  {shifts.map((shift) => (
                    <SelectItem key={shift.id} value={shift.id}>
                      {shift.name} · {shift.startTime}–{shift.endTime}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-date">Date *</Label>
              <Input
                id="s-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !ready}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {mode === "create" ? "Create" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
