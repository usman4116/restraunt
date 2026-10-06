import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { audit } from "@/lib/audit";
import { tenantWhere, orgWhere, type TenantContext } from "@/lib/auth/context";
import type { Prisma, PayrollStatus, LeaveStatus } from "@/generated/prisma/client";
import type {
  EmployeeInput,
  AttendanceInput,
  LeaveRequestInput,
  LeaveDecisionInput,
  ShiftInput,
  ShiftAssignmentInput,
  PayrollRunInput,
  PayrollStatusInput,
  HrListQuery,
} from "../dto/hr.dto";

/** Minutes worked from clock times, tolerating a shift that crosses midnight. */
export function workedMinutes(clockIn: string, clockOut: string) {
  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  const start = toMinutes(clockIn);
  const end = toMinutes(clockOut);
  return end >= start ? end - start : end + 24 * 60 - start;
}

/** Anything past a standard day counts as overtime. */
export function overtimeMinutes(worked: number, standardMinutes = 480) {
  return Math.max(0, worked - standardMinutes);
}

/** Inclusive day count for a leave range. */
export function leaveDays(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  const diff = to.getTime() - from.getTime();
  return Math.floor(diff / 86_400_000) + 1;
}

/** Which leave decisions are legal — only a pending request can be decided. */
const LEAVE_TRANSITIONS: Record<LeaveStatus, LeaveStatus[]> = {
  PENDING: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["CANCELLED"],
  REJECTED: [],
  CANCELLED: [],
};

export function canDecideLeave(from: LeaveStatus, to: LeaveStatus) {
  return LEAVE_TRANSITIONS[from].includes(to);
}

/** Payroll runs move forward only; a paid run is immutable. */
const PAYROLL_TRANSITIONS: Record<PayrollStatus, PayrollStatus[]> = {
  DRAFT: ["PENDING_APPROVAL"],
  PENDING_APPROVAL: ["APPROVED", "DRAFT"],
  APPROVED: ["PAID", "PENDING_APPROVAL"],
  PAID: [],
};

export function canAdvancePayroll(from: PayrollStatus, to: PayrollStatus) {
  return PAYROLL_TRANSITIONS[from].includes(to);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface PayComponents {
  salaryType: string;
  salaryBase: number;
  hourlyRate: number;
  workedMinutes: number;
  overtimeMinutes: number;
  taxRatePct?: number;
}

/**
 * Gross-to-net for one employee for one period. Monthly staff draw their base
 * regardless of hours; hourly staff are paid for time actually worked. Overtime
 * pays 1.5× the effective hourly rate in both cases.
 */
export function computePayrollEntry({
  salaryType,
  salaryBase,
  hourlyRate,
  workedMinutes: worked,
  overtimeMinutes: overtime,
  taxRatePct = 10,
}: PayComponents) {
  // Monthly staff have no explicit rate, so derive one from a 30×8h month.
  const effectiveRate = salaryType === "HOURLY" ? hourlyRate : salaryBase / 240;
  const base = salaryType === "HOURLY" ? round2((worked / 60) * hourlyRate) : round2(salaryBase);
  const overtimePay = round2((overtime / 60) * effectiveRate * 1.5);
  const gross = round2(base + overtimePay);
  const taxWithheld = round2((gross * taxRatePct) / 100);
  const netPay = round2(gross - taxWithheld);
  return { baseSalary: base, overtimePay, gross, taxWithheld, netPay };
}

function monthBounds(month?: string) {
  const base = month ? new Date(`${month}-01T00:00:00`) : new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  return { start, end };
}

/** Parse "YYYY-MM-DD" as a UTC midnight date, matching Prisma's @db.Date. */
function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Combine a date and HH:mm into a server-local timestamp. */
function parseDateTime(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

/** Render a stored clock timestamp back as the "HH:mm" the UI edits. */
function formatTime(value: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export const hrService = {
  async employees(ctx: TenantContext, query: HrListQuery) {
    const where: Prisma.EmployeeWhereInput = {
      ...tenantWhere(ctx),
      ...(query.department ? { department: query.department } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: "insensitive" } },
              { lastName: { contains: query.search, mode: "insensitive" } },
              { employeeCode: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const employees = await prisma.employee.findMany({
      where,
      orderBy: [{ status: "asc" }, { firstName: "asc" }],
    });

    return employees.map((e) => ({
      id: e.id,
      employeeCode: e.employeeCode,
      firstName: e.firstName,
      lastName: e.lastName,
      fullName: `${e.firstName} ${e.lastName}`,
      email: e.email,
      phone: e.phone,
      department: e.department,
      designation: e.designation,
      joinDate: e.joinDate,
      exitDate: e.exitDate,
      salaryType: e.salaryType,
      salaryBase: Number(e.salaryBase),
      hourlyRate: Number(e.hourlyRate ?? 0),
      bankAccount: e.bankAccount,
      isActive: e.status === "ACTIVE",
    }));
  },

  async attendance(ctx: TenantContext, query: HrListQuery) {
    const { start, end } = monthBounds(query.month);
    const records = await prisma.attendanceRecord.findMany({
      where: { ...orgWhere(ctx), date: { gte: start, lt: end } },
      orderBy: [{ date: "desc" }],
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, department: true } },
      },
    });

    return records.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
      department: r.employee.department,
      date: r.date,
      attStatus: r.attStatus,
      clockIn: r.clockIn ? formatTime(r.clockIn) : null,
      clockOut: r.clockOut ? formatTime(r.clockOut) : null,
      workedMinutes: r.workedMinutes ?? 0,
      overtimeMinutes: r.overtimeMinutes,
      note: r.note,
    }));
  },

  async leaveRequests(ctx: TenantContext) {
    const requests = await prisma.leaveRequest.findMany({
      where: orgWhere(ctx),
      orderBy: [{ leaveStatus: "asc" }, { fromDate: "desc" }],
      take: 200,
      include: { employee: { select: { firstName: true, lastName: true } } },
    });

    return requests.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
      leaveType: r.leaveType,
      fromDate: r.fromDate,
      toDate: r.toDate,
      days: Number(r.days),
      reason: r.reason,
      leaveStatus: r.leaveStatus,
      approvedAt: r.approvedAt,
    }));
  },

  async shifts(ctx: TenantContext) {
    const shifts = await prisma.shift.findMany({
      where: { ...tenantWhere(ctx), status: "ACTIVE" },
      orderBy: { startTime: "asc" },
    });
    return shifts.map((s) => ({
      id: s.id,
      name: s.name,
      startTime: s.startTime,
      endTime: s.endTime,
    }));
  },

  async payrollRuns(ctx: TenantContext) {
    const runs = await prisma.payrollRun.findMany({
      where: orgWhere(ctx),
      orderBy: { periodStart: "desc" },
      take: 50,
      include: { _count: { select: { entries: true } } },
    });
    return runs.map((r) => ({
      id: r.id,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      payrollStatus: r.payrollStatus,
      totalGross: Number(r.totalGross),
      totalNet: Number(r.totalNet),
      entryCount: r._count.entries,
      paidAt: r.paidAt,
    }));
  },

  async summary(ctx: TenantContext, month?: string) {
    const { start, end } = monthBounds(month);
    const scope = { ...orgWhere(ctx), date: { gte: start, lt: end } };

    const [headcount, attendanceGroups, pendingLeave, payroll] = await Promise.all([
      prisma.employee.count({ where: { ...tenantWhere(ctx), status: "ACTIVE" } }),
      prisma.attendanceRecord.groupBy({
        by: ["attStatus"],
        where: scope,
        _count: { _all: true },
      }),
      prisma.leaveRequest.count({ where: { ...orgWhere(ctx), leaveStatus: "PENDING" } }),
      prisma.payrollRun.aggregate({
        where: { ...orgWhere(ctx), periodStart: { gte: start, lt: end } },
        _sum: { totalNet: true },
      }),
    ]);

    const byStatus = Object.fromEntries(
      attendanceGroups.map((g) => [g.attStatus, g._count._all]),
    );
    const marked = attendanceGroups.reduce((sum, g) => sum + g._count._all, 0);
    const present = (byStatus.PRESENT ?? 0) + (byStatus.LATE ?? 0) + (byStatus.HALF_DAY ?? 0);

    return {
      headcount,
      present,
      absent: byStatus.ABSENT ?? 0,
      onLeave: byStatus.ON_LEAVE ?? 0,
      // Share of marked days that were actually worked — 0 when nothing is marked.
      attendanceRate: marked === 0 ? 0 : Math.round((present / marked) * 100),
      pendingLeave,
      payrollNet: Number(payroll._sum.totalNet ?? 0),
    };
  },

  async createEmployee(ctx: TenantContext, input: EmployeeInput) {
    const duplicate = await prisma.employee.findFirst({
      where: { organizationId: ctx.organizationId, employeeCode: input.employeeCode },
    });
    if (duplicate) {
      throw new DomainError("CONFLICT", "That employee code is already in use.", {
        employeeCode: "Already in use",
      });
    }

    const employee = await prisma.employee.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: ctx.branchId ?? null,
        employeeCode: input.employeeCode,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email || null,
        phone: input.phone || null,
        department: input.department || null,
        designation: input.designation || null,
        joinDate: parseDate(input.joinDate),
        salaryType: input.salaryType,
        salaryBase: input.salaryBase,
        hourlyRate: input.salaryType === "HOURLY" ? input.hourlyRate : null,
        bankAccount: input.bankAccount || null,
        createdById: ctx.userId,
      },
    });

    audit(ctx, {
      action: "hr.employee.create",
      entityType: "Employee",
      entityId: employee.id,
      after: employee,
    });
    return employee;
  },

  async updateEmployee(ctx: TenantContext, id: string, input: EmployeeInput) {
    const before = await prisma.employee.findFirst({ where: { ...tenantWhere(ctx), id } });
    if (!before) throw new DomainError("NOT_FOUND", "Employee not found.");

    await prisma.employee.update({
      where: { id },
      data: {
        employeeCode: input.employeeCode,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email || null,
        phone: input.phone || null,
        department: input.department || null,
        designation: input.designation || null,
        joinDate: parseDate(input.joinDate),
        salaryType: input.salaryType,
        salaryBase: input.salaryBase,
        hourlyRate: input.salaryType === "HOURLY" ? input.hourlyRate : null,
        bankAccount: input.bankAccount || null,
        updatedById: ctx.userId,
      },
    });

    audit(ctx, {
      action: "hr.employee.update",
      entityType: "Employee",
      entityId: id,
      before,
      after: input,
    });
  },

  async removeEmployee(ctx: TenantContext, id: string) {
    const result = await prisma.employee.updateMany({
      where: { ...tenantWhere(ctx), id },
      data: { deletedAt: new Date(), status: "INACTIVE", exitDate: new Date() },
    });
    if (result.count === 0) throw new DomainError("NOT_FOUND", "Employee not found.");
    audit(ctx, { action: "hr.employee.delete", entityType: "Employee", entityId: id });
  },

  /** Mark attendance for one employee-day. Re-marking the same day overwrites it. */
  async markAttendance(ctx: TenantContext, input: AttendanceInput) {
    const employee = await prisma.employee.findFirst({
      where: { ...tenantWhere(ctx), id: input.employeeId },
    });
    if (!employee) throw new DomainError("NOT_FOUND", "Employee not found.");

    const clockIn = input.clockIn ? parseDateTime(input.date, input.clockIn) : null;
    const clockOut = input.clockOut ? parseDateTime(input.date, input.clockOut) : null;
    const worked =
      input.clockIn && input.clockOut ? workedMinutes(input.clockIn, input.clockOut) : null;

    const data = {
      attStatus: input.attStatus,
      clockIn,
      clockOut,
      workedMinutes: worked,
      overtimeMinutes: worked === null ? 0 : overtimeMinutes(worked),
      note: input.note || null,
    };

    const record = await prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId: input.employeeId, date: parseDate(input.date) } },
      create: {
        organizationId: ctx.organizationId,
        employeeId: input.employeeId,
        date: parseDate(input.date),
        ...data,
      },
      update: data,
    });

    audit(ctx, {
      action: "hr.attendance.mark",
      entityType: "AttendanceRecord",
      entityId: record.id,
      after: data,
    });
    return record;
  },

  async requestLeave(ctx: TenantContext, input: LeaveRequestInput) {
    const employee = await prisma.employee.findFirst({
      where: { ...tenantWhere(ctx), id: input.employeeId },
    });
    if (!employee) throw new DomainError("NOT_FOUND", "Employee not found.");

    // Reject a second live request covering the same dates.
    const clash = await prisma.leaveRequest.findFirst({
      where: {
        employeeId: input.employeeId,
        leaveStatus: { in: ["PENDING", "APPROVED"] },
        fromDate: { lte: parseDate(input.toDate) },
        toDate: { gte: parseDate(input.fromDate) },
      },
    });
    if (clash) {
      throw new DomainError("CONFLICT", "Leave already requested for these dates.", {
        fromDate: "Overlapping request",
      });
    }

    const request = await prisma.leaveRequest.create({
      data: {
        organizationId: ctx.organizationId,
        employeeId: input.employeeId,
        leaveType: input.leaveType,
        fromDate: parseDate(input.fromDate),
        toDate: parseDate(input.toDate),
        days: leaveDays(input.fromDate, input.toDate),
        reason: input.reason || null,
      },
    });

    audit(ctx, {
      action: "hr.leave.request",
      entityType: "LeaveRequest",
      entityId: request.id,
      after: request,
    });
    return request;
  },

  /**
   * Approve, reject or cancel a leave request. Approving also writes ON_LEAVE
   * attendance across the range so the two views cannot disagree.
   */
  async decideLeave(ctx: TenantContext, input: LeaveDecisionInput) {
    const request = await prisma.leaveRequest.findFirst({
      where: { ...orgWhere(ctx), id: input.leaveRequestId },
    });
    if (!request) throw new DomainError("NOT_FOUND", "Leave request not found.");

    if (!canDecideLeave(request.leaveStatus, input.leaveStatus)) {
      throw new DomainError(
        "VALIDATION_ERROR",
        `A ${request.leaveStatus.toLowerCase()} request cannot be ${input.leaveStatus.toLowerCase()}.`,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id: request.id },
        data: {
          leaveStatus: input.leaveStatus,
          approvedById: input.leaveStatus === "APPROVED" ? ctx.userId : null,
          approvedAt: input.leaveStatus === "APPROVED" ? new Date() : null,
        },
      });

      if (input.leaveStatus !== "APPROVED") return;

      const cursor = new Date(request.fromDate);
      while (cursor <= request.toDate) {
        const date = new Date(cursor);
        await tx.attendanceRecord.upsert({
          where: { employeeId_date: { employeeId: request.employeeId, date } },
          create: {
            organizationId: ctx.organizationId,
            employeeId: request.employeeId,
            date,
            attStatus: "ON_LEAVE",
            overtimeMinutes: 0,
            note: `${request.leaveType} leave`,
          },
          update: { attStatus: "ON_LEAVE", note: `${request.leaveType} leave` },
        });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    });

    audit(ctx, {
      action: `hr.leave.${input.leaveStatus.toLowerCase()}`,
      entityType: "LeaveRequest",
      entityId: request.id,
      before: { leaveStatus: request.leaveStatus },
      after: { leaveStatus: input.leaveStatus },
    });
  },

  async createShift(ctx: TenantContext, input: ShiftInput) {
    if (!ctx.branchId) throw new DomainError("VALIDATION_ERROR", "Select a branch first.");
    const duplicate = await prisma.shift.findFirst({
      where: { branchId: ctx.branchId, name: input.name, deletedAt: null },
    });
    if (duplicate) {
      throw new DomainError("CONFLICT", "A shift with this name already exists.", {
        name: "Already in use",
      });
    }

    const shift = await prisma.shift.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: ctx.branchId,
        name: input.name,
        startTime: input.startTime,
        endTime: input.endTime,
      },
    });
    audit(ctx, {
      action: "hr.shift.create",
      entityType: "Shift",
      entityId: shift.id,
      after: shift,
    });
    return shift;
  },

  async removeShift(ctx: TenantContext, id: string) {
    const result = await prisma.shift.updateMany({
      where: { ...tenantWhere(ctx), id },
      data: { deletedAt: new Date(), status: "INACTIVE" },
    });
    if (result.count === 0) throw new DomainError("NOT_FOUND", "Shift not found.");
    audit(ctx, { action: "hr.shift.delete", entityType: "Shift", entityId: id });
  },

  /** One shift per employee per day — re-assigning replaces the existing one. */
  async assignShift(ctx: TenantContext, input: ShiftAssignmentInput) {
    const [employee, shift] = await Promise.all([
      prisma.employee.findFirst({ where: { ...tenantWhere(ctx), id: input.employeeId } }),
      prisma.shift.findFirst({ where: { ...tenantWhere(ctx), id: input.shiftId } }),
    ]);
    if (!employee) throw new DomainError("NOT_FOUND", "Employee not found.");
    if (!shift) throw new DomainError("NOT_FOUND", "Shift not found.");

    const assignment = await prisma.shiftAssignment.upsert({
      where: { employeeId_date: { employeeId: input.employeeId, date: parseDate(input.date) } },
      create: {
        employeeId: input.employeeId,
        shiftId: input.shiftId,
        date: parseDate(input.date),
      },
      update: { shiftId: input.shiftId },
    });

    audit(ctx, {
      action: "hr.shift.assign",
      entityType: "ShiftAssignment",
      entityId: assignment.id,
      after: assignment,
    });
    return assignment;
  },

  /**
   * Build a payroll run from attendance in the period. Regenerating a DRAFT run
   * replaces its entries, so a correction to attendance can simply be re-run.
   */
  async generatePayroll(ctx: TenantContext, input: PayrollRunInput) {
    const periodStart = parseDate(input.periodStart);
    const periodEnd = parseDate(input.periodEnd);

    const employees = await prisma.employee.findMany({
      where: { ...tenantWhere(ctx), status: "ACTIVE" },
    });
    if (employees.length === 0) {
      throw new DomainError("VALIDATION_ERROR", "There are no active employees to pay.");
    }

    const attendance = await prisma.attendanceRecord.groupBy({
      by: ["employeeId"],
      where: {
        ...orgWhere(ctx),
        date: { gte: periodStart, lte: periodEnd },
      },
      _sum: { workedMinutes: true, overtimeMinutes: true },
    });
    const byEmployee = new Map(attendance.map((a) => [a.employeeId, a]));

    const entries = employees.map((employee) => {
      const stats = byEmployee.get(employee.id);
      const computed = computePayrollEntry({
        salaryType: employee.salaryType,
        salaryBase: Number(employee.salaryBase),
        hourlyRate: Number(employee.hourlyRate ?? 0),
        workedMinutes: stats?._sum.workedMinutes ?? 0,
        overtimeMinutes: stats?._sum.overtimeMinutes ?? 0,
      });
      return { employee, computed, stats };
    });

    const totalGross = round2(entries.reduce((sum, e) => sum + e.computed.gross, 0));
    const totalNet = round2(entries.reduce((sum, e) => sum + e.computed.netPay, 0));

    const run = await prisma.$transaction(async (tx) => {
      const created = await tx.payrollRun.create({
        data: {
          organizationId: ctx.organizationId,
          branchId: ctx.branchId ?? null,
          periodStart,
          periodEnd,
          totalGross,
          totalNet,
          createdById: ctx.userId,
        },
      });

      await tx.payrollEntry.createMany({
        data: entries.map(({ employee, computed, stats }) => ({
          payrollRunId: created.id,
          employeeId: employee.id,
          baseSalary: computed.baseSalary,
          overtimePay: computed.overtimePay,
          bonuses: 0,
          deductions: 0,
          taxWithheld: computed.taxWithheld,
          netPay: computed.netPay,
          breakdown: {
            workedMinutes: stats?._sum.workedMinutes ?? 0,
            overtimeMinutes: stats?._sum.overtimeMinutes ?? 0,
            salaryType: employee.salaryType,
          },
        })),
      });

      return created;
    });

    audit(ctx, {
      action: "hr.payroll.generate",
      entityType: "PayrollRun",
      entityId: run.id,
      after: { periodStart, periodEnd, totalGross, totalNet, entries: entries.length },
    });
    return run;
  },

  async payrollEntries(ctx: TenantContext, payrollRunId: string) {
    const run = await prisma.payrollRun.findFirst({
      where: { ...orgWhere(ctx), id: payrollRunId },
    });
    if (!run) throw new DomainError("NOT_FOUND", "Payroll run not found.");

    const entries = await prisma.payrollEntry.findMany({
      where: { payrollRunId },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      },
    });

    return entries.map((e) => ({
      id: e.id,
      employeeName: `${e.employee.firstName} ${e.employee.lastName}`,
      employeeCode: e.employee.employeeCode,
      baseSalary: Number(e.baseSalary),
      overtimePay: Number(e.overtimePay),
      bonuses: Number(e.bonuses),
      deductions: Number(e.deductions),
      taxWithheld: Number(e.taxWithheld),
      netPay: Number(e.netPay),
    }));
  },

  async setPayrollStatus(ctx: TenantContext, input: PayrollStatusInput) {
    const run = await prisma.payrollRun.findFirst({
      where: { ...orgWhere(ctx), id: input.payrollRunId },
    });
    if (!run) throw new DomainError("NOT_FOUND", "Payroll run not found.");
    if (run.payrollStatus === input.payrollStatus) return;

    if (!canAdvancePayroll(run.payrollStatus, input.payrollStatus)) {
      throw new DomainError(
        "VALIDATION_ERROR",
        `A ${run.payrollStatus.toLowerCase().replace(/_/g, " ")} run cannot move to ${input.payrollStatus.toLowerCase().replace(/_/g, " ")}.`,
      );
    }

    await prisma.payrollRun.update({
      where: { id: run.id },
      data: {
        payrollStatus: input.payrollStatus,
        approvedById: input.payrollStatus === "APPROVED" ? ctx.userId : run.approvedById,
        paidAt: input.payrollStatus === "PAID" ? new Date() : run.paidAt,
      },
    });

    audit(ctx, {
      action: `hr.payroll.${input.payrollStatus.toLowerCase()}`,
      entityType: "PayrollRun",
      entityId: run.id,
      before: { payrollStatus: run.payrollStatus },
      after: { payrollStatus: input.payrollStatus },
    });
  },

  async removePayrollRun(ctx: TenantContext, id: string) {
    const run = await prisma.payrollRun.findFirst({ where: { ...orgWhere(ctx), id } });
    if (!run) throw new DomainError("NOT_FOUND", "Payroll run not found.");
    if (run.payrollStatus === "PAID") {
      throw new DomainError("CONFLICT", "A paid run cannot be deleted.");
    }

    await prisma.$transaction([
      prisma.payrollEntry.deleteMany({ where: { payrollRunId: id } }),
      prisma.payrollRun.delete({ where: { id } }),
    ]);
    audit(ctx, { action: "hr.payroll.delete", entityType: "PayrollRun", entityId: id });
  },
};
