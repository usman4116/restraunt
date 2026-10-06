"use server";

import { revalidatePath } from "next/cache";
import { guard, err, type Result } from "@/lib/result";
import { requirePermission } from "@/lib/auth/context";
import {
  invoiceSchema,
  invoicePaymentSchema,
  bankAccountSchema,
  bankTransactionSchema,
} from "../dto/invoicing.dto";
import { invoicingService } from "../service/invoicing.service";

function zodFields(e: import("zod").ZodError): Record<string, string> {
  return Object.fromEntries(e.issues.map((i) => [i.path.join("."), i.message]));
}

export async function createInvoiceAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = invoiceSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("finance:create");
    const invoice = await invoicingService.createInvoice(ctx, parsed.data);
    revalidatePath("/finance");
    return { id: invoice.id };
  });
}

export async function updateInvoiceAction(id: string, raw: unknown): Promise<Result<null>> {
  const parsed = invoiceSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("finance:update");
    await invoicingService.updateInvoice(ctx, id, parsed.data);
    revalidatePath("/finance");
    return null;
  });
}

export async function issueInvoiceAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("finance:update");
    await invoicingService.issueInvoice(ctx, id);
    revalidatePath("/finance");
    return null;
  });
}

/** Voiding cancels a live document, so it sits behind the approval permission. */
export async function voidInvoiceAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("finance:approve");
    await invoicingService.voidInvoice(ctx, id);
    revalidatePath("/finance");
    return null;
  });
}

export async function deleteInvoiceAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("finance:delete");
    await invoicingService.removeInvoice(ctx, id);
    revalidatePath("/finance");
    return null;
  });
}

export async function payInvoiceAction(raw: unknown): Promise<Result<null>> {
  const parsed = invoicePaymentSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("finance:update");
    await invoicingService.payInvoice(ctx, parsed.data);
    revalidatePath("/finance");
    return null;
  });
}

export async function createBankAccountAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = bankAccountSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("finance:create");
    const account = await invoicingService.createBankAccount(ctx, parsed.data);
    revalidatePath("/finance");
    return { id: account.id };
  });
}

export async function updateBankAccountAction(id: string, raw: unknown): Promise<Result<null>> {
  const parsed = bankAccountSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("finance:update");
    await invoicingService.updateBankAccount(ctx, id, parsed.data);
    revalidatePath("/finance");
    return null;
  });
}

export async function deleteBankAccountAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("finance:delete");
    await invoicingService.removeBankAccount(ctx, id);
    revalidatePath("/finance");
    return null;
  });
}

export async function createBankTransactionAction(
  raw: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = bankTransactionSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("finance:create");
    const txn = await invoicingService.createBankTransaction(ctx, parsed.data);
    revalidatePath("/finance");
    return { id: txn.id };
  });
}

export async function reconcileBankTransactionAction(
  id: string,
  reconciled: boolean,
): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("finance:update");
    await invoicingService.reconcileBankTransaction(ctx, id, reconciled);
    revalidatePath("/finance");
    return null;
  });
}

export async function deleteBankTransactionAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("finance:delete");
    await invoicingService.removeBankTransaction(ctx, id);
    revalidatePath("/finance");
    return null;
  });
}
