import { z } from "zod";

const optionalString = (max: number) => z.string().max(max).optional().or(z.literal(""));
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

export const ATTENDANCE_STATUSES = [
  "PRESENT",
  "ABSENT",
  "LATE",
  "HALF_DAY",
  "ON_LEAVE",
  "HOLIDAY",
] as const;

export const LEAVE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export const LEAVE_TYPES = ["ANNUAL", "SICK", "UNPAID"] as const;
export const PAYROLL_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PAID"] as const;
export const SALARY_TYPES = ["MONTHLY", "HOURLY"] as const;

export const employeeSchema = z
  .object({
    employeeCode: z.string().min(1, "Employee code is required").max(40),
    firstName: z.string().min(1, "First name is required").max(80),
    lastName: z.string().min(1, "Last name is required").max(80),
    email: z.string().email("Enter a valid email").max(160).optional().or(z.literal("")),
    phone: optionalString(32),
    department: optionalString(60),
    designation: optionalString(60),
    joinDate: dateOnly,
    salaryType: z.enum(SALARY_TYPES).default("MONTHLY"),
    salaryBase: z.coerce.number().min(0).max(10_000_000).default(0),
    hourlyRate: z.coerce.number().min(0).max(100_000).default(0),
    bankAccount: optionalString(60),
  })
  // An hourly employee without a rate cannot be paid, so reject it at the edge.
  .refine((v) => v.salaryType !== "HOURLY" || v.hourlyRate > 0, {
    message: "Hourly staff need an hourly rate",
    path: ["hourlyRate"],
  });

export const attendanceSchema = z.object({
  employeeId: z.string().uuid(),
  date: dateOnly,
  attStatus: z.enum(ATTENDANCE_STATUSES),
  clockIn: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Use HH:mm")
    .optional()
    .or(z.literal("")),
  clockOut: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Use HH:mm")
    .optional()
    .or(z.literal("")),
  note: optionalString(300),
});

export const leaveRequestSchema = z
  .object({
    employeeId: z.string().uuid("Pick an employee"),
    leaveType: z.enum(LEAVE_TYPES),
    fromDate: dateOnly,
    toDate: dateOnly,
    reason: optionalString(500),
  })
  .refine((v) => v.toDate >= v.fromDate, {
    message: "End date cannot be before the start date",
    path: ["toDate"],
  });

export const leaveDecisionSchema = z.object({
  leaveRequestId: z.string().uuid(),
  leaveStatus: z.enum(["APPROVED", "REJECTED", "CANCELLED"]),
});

export const shiftSchema = z.object({
  name: z.string().min(1, "Shift name is required").max(60),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm"),
});

export const shiftAssignmentSchema = z.object({
  employeeId: z.string().uuid("Pick an employee"),
  shiftId: z.string().uuid("Pick a shift"),
  date: dateOnly,
});

export const payrollRunSchema = z
  .object({
    periodStart: dateOnly,
    periodEnd: dateOnly,
  })
  .refine((v) => v.periodEnd >= v.periodStart, {
    message: "Period end cannot be before the start",
    path: ["periodEnd"],
  });

export const payrollStatusSchema = z.object({
  payrollRunId: z.string().uuid(),
  payrollStatus: z.enum(PAYROLL_STATUSES),
});

export const hrListQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  department: z.string().max(60).optional(),
  search: z.string().max(100).optional(),
});

export type EmployeeInput = z.output<typeof employeeSchema>;
export type AttendanceInput = z.output<typeof attendanceSchema>;
export type LeaveRequestInput = z.output<typeof leaveRequestSchema>;
export type LeaveDecisionInput = z.output<typeof leaveDecisionSchema>;
export type ShiftInput = z.output<typeof shiftSchema>;
export type ShiftAssignmentInput = z.output<typeof shiftAssignmentSchema>;
export type PayrollRunInput = z.output<typeof payrollRunSchema>;
export type PayrollStatusInput = z.output<typeof payrollStatusSchema>;
export type HrListQuery = z.output<typeof hrListQuerySchema>;
