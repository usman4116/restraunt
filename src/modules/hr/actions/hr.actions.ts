"use server";

import { revalidatePath } from "next/cache";
import { guard, err, type Result } from "@/lib/result";
import { requirePermission } from "@/lib/auth/context";
import {
  employeeSchema,
  attendanceSchema,
  leaveRequestSchema,
  leaveDecisionSchema,
  shiftSchema,
  shiftAssignmentSchema,
  payrollRunSchema,
  payrollStatusSchema,
} from "../dto/hr.dto";
import { hrService } from "../service/hr.service";

function zodFields(e: import("zod").ZodError): Record<string, string> {
  return Object.fromEntries(e.issues.map((i) => [i.path.join("."), i.message]));
}

export async function createEmployeeAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = employeeSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("employees:create");
    const employee = await hrService.createEmployee(ctx, parsed.data);
    revalidatePath("/hr");
    return { id: employee.id };
  });
}

export async function updateEmployeeAction(id: string, raw: unknown): Promise<Result<null>> {
  const parsed = employeeSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("employees:update");
    await hrService.updateEmployee(ctx, id, parsed.data);
    revalidatePath("/hr");
    return null;
  });
}

export async function deleteEmployeeAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("employees:delete");
    await hrService.removeEmployee(ctx, id);
    revalidatePath("/hr");
    return null;
  });
}

export async function markAttendanceAction(raw: unknown): Promise<Result<null>> {
  const parsed = attendanceSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("attendance:create");
    await hrService.markAttendance(ctx, parsed.data);
    revalidatePath("/hr");
    return null;
  });
}

export async function requestLeaveAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = leaveRequestSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("attendance:create");
    const request = await hrService.requestLeave(ctx, parsed.data);
    revalidatePath("/hr");
    return { id: request.id };
  });
}

export async function decideLeaveAction(raw: unknown): Promise<Result<null>> {
  const parsed = leaveDecisionSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("attendance:update");
    await hrService.decideLeave(ctx, parsed.data);
    revalidatePath("/hr");
    return null;
  });
}

export async function createShiftAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = shiftSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("attendance:create");
    const shift = await hrService.createShift(ctx, parsed.data);
    revalidatePath("/hr");
    return { id: shift.id };
  });
}

export async function deleteShiftAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("attendance:delete");
    await hrService.removeShift(ctx, id);
    revalidatePath("/hr");
    return null;
  });
}

export async function assignShiftAction(raw: unknown): Promise<Result<null>> {
  const parsed = shiftAssignmentSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("attendance:create");
    await hrService.assignShift(ctx, parsed.data);
    revalidatePath("/hr");
    return null;
  });
}

export async function generatePayrollAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = payrollRunSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("payroll:create");
    const run = await hrService.generatePayroll(ctx, parsed.data);
    revalidatePath("/hr");
    return { id: run.id };
  });
}

export async function setPayrollStatusAction(raw: unknown): Promise<Result<null>> {
  const parsed = payrollStatusSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("payroll:update");
    await hrService.setPayrollStatus(ctx, parsed.data);
    revalidatePath("/hr");
    return null;
  });
}

export async function deletePayrollRunAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("payroll:delete");
    await hrService.removePayrollRun(ctx, id);
    revalidatePath("/hr");
    return null;
  });
}
