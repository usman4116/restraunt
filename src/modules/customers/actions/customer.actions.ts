"use server";

import { revalidatePath } from "next/cache";
import { guard, err, type Result } from "@/lib/result";
import { requirePermission } from "@/lib/auth/context";
import {
  customerSchema,
  loyaltyAdjustSchema,
  feedbackResolveSchema,
} from "../dto/customer.dto";
import { customerService } from "../service/customer.service";

function zodFields(e: import("zod").ZodError): Record<string, string> {
  return Object.fromEntries(e.issues.map((i) => [i.path.join("."), i.message]));
}

export async function createCustomerAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = customerSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("customers:create");
    const customer = await customerService.create(ctx, parsed.data);
    revalidatePath("/customers");
    return { id: customer.id };
  });
}

export async function updateCustomerAction(id: string, raw: unknown): Promise<Result<null>> {
  const parsed = customerSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("customers:update");
    await customerService.update(ctx, id, parsed.data);
    revalidatePath("/customers");
    return null;
  });
}

export async function deleteCustomerAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("customers:delete");
    await customerService.remove(ctx, id);
    revalidatePath("/customers");
    return null;
  });
}

export async function adjustLoyaltyAction(raw: unknown): Promise<Result<null>> {
  const parsed = loyaltyAdjustSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("loyalty:manage");
    await customerService.adjustLoyalty(ctx, parsed.data);
    revalidatePath("/customers");
    return null;
  });
}

export async function resolveFeedbackAction(raw: unknown): Promise<Result<null>> {
  const parsed = feedbackResolveSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("customers:update");
    await customerService.resolveFeedback(ctx, parsed.data.feedbackId);
    revalidatePath("/customers");
    return null;
  });
}

/** Search-as-you-type source for the POS customer picker. */
export async function listCustomersAction(search?: string): Promise<
  Result<
    Array<{
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      loyaltyTier: string;
    }>
  >
> {
  return guard(async () => {
    const ctx = await requirePermission("customers:view");
    const { customers } = await customerService.list(ctx, {
      page: 1,
      pageSize: 20,
      search: search?.trim() || undefined,
    });
    return customers.map((c) => ({
      id: c.id,
      name: `${c.firstName}${c.lastName ? ` ${c.lastName}` : ""}`,
      phone: c.phone,
      email: c.email,
      loyaltyTier: c.loyaltyTier,
    }));
  });
}

