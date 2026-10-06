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
import { requestLeaveAction } from "../actions/hr.actions";
import { LEAVE_TYPES } from "../dto/hr.dto";
import type { EmployeeRow } from "./employee-dialog";

interface Props {
  open: boolean;
  employees: EmployeeRow[];
  onClose: () => void;
}

export function LeaveRequestDialog({ open, employees, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [employeeId, setEmployeeId] = useState("");
  const [leaveType, setLeaveType] = useState<string>("ANNUAL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");

  const submit = () =>
    startTransition(async () => {
      const result = await requestLeaveAction({
        employeeId,
        leaveType,
        fromDate,
        toDate,
        reason,
      });
      if (result.ok) {
        toast.success("Leave request submitted");
        setReason("");
        onClose();
        router.refresh();
      } else {
        const fields = result.error.fields;
        toast.error(fields?.employeeId || fields?.toDate || result.error.message);
      }
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request leave</DialogTitle>
          <DialogDescription>
            The request goes to a manager for approval.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="l-emp">Employee *</Label>
            <Select value={employeeId} onValueChange={(value) => setEmployeeId(value ?? "")}>
              <SelectTrigger id="l-emp">
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
            <Label htmlFor="l-type">Leave type *</Label>
            <Select value={leaveType} onValueChange={(value) => setLeaveType(value ?? "ANNUAL")}>
              <SelectTrigger id="l-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type.toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="l-from">From *</Label>
              <Input
                id="l-from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="l-to">To *</Label>
              <Input
                id="l-to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="l-reason">Reason</Label>
            <Textarea
              id="l-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !employeeId || !fromDate || !toDate}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Request leave
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
