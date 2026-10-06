"use server";

import { revalidatePath } from "next/cache";
import { guard, err, type Result } from "@/lib/result";
import { requirePermission } from "@/lib/auth/context";
import {
  inventoryItemSchema,
  stockAdjustmentSchema,
} from "../dto/inventory.dto";
import { inventoryService } from "../service/inventory.service";

function zodFields(e: import("zod").ZodError): Record<string, string> {
  return Object.fromEntries(e.issues.map((i) => [i.path.join("."), i.message]));
}

export async function createInventoryItemAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = inventoryItemSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("inventory:create");
    const item = await inventoryService.create(ctx, parsed.data);
    revalidatePath("/inventory");
    return { id: item.id };
  });
}

export async function updateInventoryItemAction(id: string, raw: unknown): Promise<Result<null>> {
  const parsed = inventoryItemSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("inventory:update");
    await inventoryService.update(ctx, id, parsed.data);
    revalidatePath("/inventory");
    return null;
  });
}

export async function deleteInventoryItemAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("inventory:delete");
    await inventoryService.remove(ctx, id);
    revalidatePath("/inventory");
    return null;
  });
}

export async function adjustStockAction(raw: unknown): Promise<Result<null>> {
  const parsed = stockAdjustmentSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("inventory:update");
    await inventoryService.adjustStock(ctx, parsed.data);
    revalidatePath("/inventory");
    revalidatePath("/dashboard");
    return null;
  });
}
