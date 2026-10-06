"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Users,
  CalendarCheck,
  CalendarClock,
  Wallet,
  Check,
  X,
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
  deleteEmployeeAction,
  decideLeaveAction,
  deleteShiftAction,
  setPayrollStatusAction,
  deletePayrollRunAction,
} from "../actions/hr.actions";
import { EmployeeDialog, type EmployeeRow } from "./employee-dialog";
import { AttendanceDialog } from "./attendance-dialog";
import { LeaveRequestDialog } from "./leave-dialog";
import { ShiftDialog, type ShiftRow } from "./shift-dialog";
import { PayrollDialog } from "./payroll-dialog";

export interface AttendanceRow {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string | null;
  date: Date | string;
  attStatus: string;
  clockIn: string | null;
  clockOut: string | null;
  workedMinutes: number;
  overtimeMinutes: number;
  note: string | null;
}

export interface LeaveRow {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveType: string;
  fromDate: Date | string;
  toDate: Date | string;
  days: number;
  reason: string | null;
  leaveStatus: string;
  approvedAt: Date | string | null;
}

export interface PayrollRunRow {
  id: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  payrollStatus: string;
  totalGross: number;
  totalNet: number;
  entryCount: number;
  paidAt: Date | string | null;
}

interface Props {
  employees: EmployeeRow[];
  attendance: AttendanceRow[];
  leaveRequests: LeaveRow[];
  shifts: ShiftRow[];
  payrollRuns: PayrollRunRow[];
  summary: {
    headcount: number;
    present: number;
    absent: number;
    onLeave: number;
    attendanceRate: number;
    pendingLeave: number;
    payrollNet: number;
  };
  month: string;
}

const ATT_STYLES: Record<string, string> = {
  PRESENT: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  LATE: "bg-amber-500/15 text-amber-700 dark:text-amber-500",
  HALF_DAY: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  ABSENT: "bg-red-500/15 text-red-700 dark:text-red-400",
  ON_LEAVE: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  HOLIDAY: "bg-muted text-muted-foreground",
};

const LEAVE_STYLES: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-700 dark:text-amber-500",
  APPROVED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  REJECTED: "bg-red-500/15 text-red-700 dark:text-red-400",
  CANCELLED: "bg-muted text-muted-foreground",
};

// Forward moves only — the service owns the full transition table.
const NEXT_PAYROLL: Record<string, { value: string; label: string }[]> = {
  DRAFT: [{ value: "PENDING_APPROVAL", label: "Submit" }],
  PENDING_APPROVAL: [
    { value: "APPROVED", label: "Approve" },
    { value: "DRAFT", label: "Reopen" },
  ],
  APPROVED: [
    { value: "PAID", label: "Mark paid" },
    { value: "PENDING_APPROVAL", label: "Send back" },
  ],
  PAID: [],
};

const money = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });
const dayFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

function hours(minutes: number) {
  if (minutes <= 0) return "—";
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export function HrManager({
  employees,
  attendance,
  leaveRequests,
  shifts,
  payrollRuns,
  summary,
  month,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const [employeeDialog, setEmployeeDialog] = useState<{
    open: boolean;
    employee?: EmployeeRow;
  }>({ open: false });
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [shiftDialog, setShiftDialog] = useState<"create" | "assign" | null>(null);
  const [payrollOpen, setPayrollOpen] = useState(false);

  // The month filter drives every tab, so period defaults derive from it too.
  const today = `${month}-01`;
  const periodEnd = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5, 7)),
    0,
  )
    .toISOString()
    .split("T")[0];

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(search.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  };

  const removeEmployee = async (employee: EmployeeRow) => {
    if (!confirm(`Remove ${employee.fullName}?`)) return;
    const result = await deleteEmployeeAction(employee.id);
    if (result.ok) {
      toast.success("Employee removed");
      router.refresh();
    } else toast.error(result.error.message);
  };

  const decide = async (leave: LeaveRow, leaveStatus: string) => {
    const result = await decideLeaveAction({ leaveRequestId: leave.id, leaveStatus });
    if (result.ok) {
      toast.success(`Leave ${leaveStatus.toLowerCase()}`);
      router.refresh();
    } else toast.error(result.error.message);
  };

  const removeShift = async (shift: ShiftRow) => {
    if (!confirm(`Remove shift "${shift.name}"?`)) return;
    const result = await deleteShiftAction(shift.id);
    if (result.ok) {
      toast.success("Shift removed");
      router.refresh();
    } else toast.error(result.error.message);
  };

  const advancePayroll = async (run: PayrollRunRow, payrollStatus: string) => {
    const result = await setPayrollStatusAction({ payrollRunId: run.id, payrollStatus });
    if (result.ok) {
      toast.success(`Payroll ${payrollStatus.replace(/_/g, " ").toLowerCase()}`);
      router.refresh();
    } else toast.error(result.error.message);
  };

  const removeRun = async (run: PayrollRunRow) => {
    if (!confirm("Delete this payroll run and all its entries?")) return;
    const result = await deletePayrollRunAction(run.id);
    if (result.ok) {
      toast.success("Payroll run deleted");
      router.refresh();
    } else toast.error(result.error.message);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">People</h1>
          <p className="text-sm text-muted-foreground">
            Employees, attendance, leave, shifts and payroll
          </p>
        </div>
        <Input
          type="month"
          className="w-44"
          value={month}
          onChange={(e) => setParam("month", e.target.value)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Headcount"
          value={String(summary.headcount)}
          hint="Active employees"
          icon={Users}
        />
        <StatTile
          label="Attendance"
          value={`${summary.attendanceRate}%`}
          hint={`${summary.present} present · ${summary.absent} absent`}
          icon={CalendarCheck}
          tone={summary.attendanceRate < 80 ? "warning" : "default"}
        />
        <StatTile
          label="On leave"
          value={String(summary.onLeave)}
          hint={
            summary.pendingLeave > 0
              ? `${summary.pendingLeave} request(s) awaiting you`
              : "No pending requests"
          }
          icon={CalendarClock}
          tone={summary.pendingLeave > 0 ? "warning" : "default"}
        />
        <StatTile
          label="Payroll net"
          value={money.format(summary.payrollNet)}
          hint="Runs starting this month"
          icon={Wallet}
        />
      </div>

      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="shifts">Shifts</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name or code…"
                className="w-72 pl-8"
                defaultValue={search.get("search") ?? ""}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setParam("search", (e.target as HTMLInputElement).value);
                }}
              />
            </div>
            <Button onClick={() => setEmployeeDialog({ open: true })}>
              <Plus className="size-4" /> Add employee
            </Button>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Pay</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      No employees yet.
                    </TableCell>
                  </TableRow>
                )}
                {employees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium">
                      {employee.fullName}
                      <div className="text-xs font-normal text-muted-foreground">
                        {employee.employeeCode}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {employee.designation || "—"}
                      {employee.department ? ` · ${employee.department}` : ""}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {employee.phone || employee.email || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {employee.salaryType === "HOURLY"
                        ? `${money.format(employee.hourlyRate)}/h`
                        : money.format(employee.salaryBase)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={employee.isActive ? "default" : "outline"}>
                        {employee.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Edit"
                          onClick={() => setEmployeeDialog({ open: true, employee })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Remove"
                          onClick={() => removeEmployee(employee)}
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

        <TabsContent value="attendance" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setAttendanceOpen(true)} disabled={employees.length === 0}>
              <Plus className="size-4" /> Mark attendance
            </Button>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Clock</TableHead>
                  <TableHead className="text-right">Worked</TableHead>
                  <TableHead className="text-right">Overtime</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendance.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      Nothing marked for this month.
                    </TableCell>
                  </TableRow>
                )}
                {attendance.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="tabular-nums">
                      {dayFormat.format(new Date(record.date))}
                    </TableCell>
                    <TableCell className="font-medium">
                      {record.employeeName}
                      {record.department && (
                        <div className="text-xs font-normal text-muted-foreground">
                          {record.department}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          ATT_STYLES[record.attStatus] ?? "bg-muted",
                        )}
                      >
                        {record.attStatus.replace(/_/g, " ").toLowerCase()}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">
                      {record.clockIn ? `${record.clockIn}–${record.clockOut ?? "…"}` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {hours(record.workedMinutes)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {hours(record.overtimeMinutes)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="leave" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setLeaveOpen(true)} disabled={employees.length === 0}>
              <Plus className="size-4" /> Request leave
            </Button>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaveRequests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      No leave requests.
                    </TableCell>
                  </TableRow>
                )}
                {leaveRequests.map((leave) => (
                  <TableRow key={leave.id}>
                    <TableCell className="font-medium">{leave.employeeName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {leave.leaveType.toLowerCase()}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {dayFormat.format(new Date(leave.fromDate))} –{" "}
                      {dayFormat.format(new Date(leave.toDate))}
                      {leave.reason && (
                        <div className="max-w-64 truncate text-xs text-muted-foreground">
                          {leave.reason}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{leave.days}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          LEAVE_STYLES[leave.leaveStatus] ?? "bg-muted",
                        )}
                      >
                        {leave.leaveStatus.toLowerCase()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {leave.leaveStatus === "PENDING" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => decide(leave, "APPROVED")}
                              title="Approve"
                            >
                              <Check className="size-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => decide(leave, "REJECTED")}
                              title="Reject"
                            >
                              <X className="size-4" />
                            </Button>
                          </>
                        )}
                        {leave.leaveStatus === "APPROVED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => decide(leave, "CANCELLED")}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="shifts" className="space-y-3">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShiftDialog("create")}>
              <Plus className="size-4" /> New shift
            </Button>
            <Button
              onClick={() => setShiftDialog("assign")}
              disabled={shifts.length === 0 || employees.length === 0}
            >
              Assign shift
            </Button>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shift</TableHead>
                  <TableHead>Starts</TableHead>
                  <TableHead>Ends</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                      No shifts defined.
                    </TableCell>
                  </TableRow>
                )}
                {shifts.map((shift) => (
                  <TableRow key={shift.id}>
                    <TableCell className="font-medium">{shift.name}</TableCell>
                    <TableCell className="tabular-nums">{shift.startTime}</TableCell>
                    <TableCell className="tabular-nums">{shift.endTime}</TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Remove"
                          onClick={() => removeShift(shift)}
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

        <TabsContent value="payroll" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setPayrollOpen(true)} disabled={employees.length === 0}>
              <Plus className="size-4" /> Generate run
            </Button>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-64" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payrollRuns.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      No payroll runs yet.
                    </TableCell>
                  </TableRow>
                )}
                {payrollRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium tabular-nums">
                      {dayFormat.format(new Date(run.periodStart))} –{" "}
                      {dayFormat.format(new Date(run.periodEnd))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{run.entryCount}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(run.totalGross)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(run.totalNet)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={run.payrollStatus === "PAID" ? "default" : "outline"}>
                        {run.payrollStatus.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {NEXT_PAYROLL[run.payrollStatus]?.map((option) => (
                          <Button
                            key={option.value}
                            size="sm"
                            variant="outline"
                            onClick={() => advancePayroll(run, option.value)}
                          >
                            {option.label}
                          </Button>
                        ))}
                        {run.payrollStatus !== "PAID" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Delete run"
                            onClick={() => removeRun(run)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <EmployeeDialog
        open={employeeDialog.open}
        employee={employeeDialog.employee}
        onClose={() => setEmployeeDialog({ open: false })}
      />
      <AttendanceDialog
        open={attendanceOpen}
        employees={employees}
        defaultDate={today}
        onClose={() => setAttendanceOpen(false)}
      />
      <LeaveRequestDialog
        open={leaveOpen}
        employees={employees}
        onClose={() => setLeaveOpen(false)}
      />
      {shiftDialog && (
        <ShiftDialog
          mode={shiftDialog}
          employees={employees}
          shifts={shifts}
          defaultDate={today}
          onClose={() => setShiftDialog(null)}
        />
      )}
      {payrollOpen && (
        <PayrollDialog
          periodStart={today}
          periodEnd={periodEnd}
          onClose={() => setPayrollOpen(false)}
        />
      )}
    </div>
  );
}
