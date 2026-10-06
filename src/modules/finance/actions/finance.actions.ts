"use server";

import { revalidatePath } from "next/cache";
import { guard, err, type Result } from "@/lib/result";
import { requirePermission } from "@/lib/auth/context";
import {
  accountSchema,
  journalEntrySchema,
  journalPostSchema,
  expenseSchema,
} from "../dto/finance.dto";
import { financeService } from "../service/finance.service";

function zodFields(e: import("zod").ZodError): Record<string, string> {
  return Object.fromEntries(e.issues.map((i) => [i.path.join("."), i.message]));
}

export async function createAccountAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = accountSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("finance:create");
    const account = await financeService.createAccount(ctx, parsed.data);
    revalidatePath("/finance");
    return { id: account.id };
  });
}

export async function updateAccountAction(id: string, raw: unknown): Promise<Result<null>> {
  const parsed = accountSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("finance:update");
    await financeService.updateAccount(ctx, id, parsed.data);
    revalidatePath("/finance");
    return null;
  });
}

export async function deleteAccountAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("finance:delete");
    await financeService.removeAccount(ctx, id);
    revalidatePath("/finance");
    return null;
  });
}

export async function createJournalAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = journalEntrySchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("finance:create");
    const entry = await financeService.createJournalEntry(ctx, parsed.data);
    revalidatePath("/finance");
    return { id: entry.id };
  });
}

export async function postJournalAction(raw: unknown): Promise<Result<null>> {
  const parsed = journalPostSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("finance:approve");
    await financeService.postJournal(ctx, parsed.data);
    revalidatePath("/finance");
    return null;
  });
}

export async function reverseJournalAction(journalEntryId: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("finance:approve");
    await financeService.reverseJournal(ctx, journalEntryId);
    revalidatePath("/finance");
    return null;
  });
}

export async function deleteJournalAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("finance:delete");
    await financeService.removeJournalEntry(ctx, id);
    revalidatePath("/finance");
    return null;
  });
}

export async function createExpenseAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = expenseSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("finance:create");
    const expense = await financeService.createExpense(ctx, parsed.data);
    revalidatePath("/finance");
    return { id: expense.id };
  });
}

export async function updateExpenseAction(id: string, raw: unknown): Promise<Result<null>> {
  const parsed = expenseSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("finance:update");
    await financeService.updateExpense(ctx, id, parsed.data);
    revalidatePath("/finance");
    return null;
  });
}

export async function deleteExpenseAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("finance:delete");
    await financeService.removeExpense(ctx, id);
    revalidatePath("/finance");
    return null;
  });
}
