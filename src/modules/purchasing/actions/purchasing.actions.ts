"use server";

import { revalidatePath } from "next/cache";
import { guard, err, type Result } from "@/lib/result";
import { requirePermission } from "@/lib/auth/context";
import {
  supplierSchema,
  purchaseOrderSchema,
  receiveGoodsSchema,
} from "../dto/purchasing.dto";
import { supplierService, purchasingService } from "../service/purchasing.service";

function zodFields(e: import("zod").ZodError): Record<string, string> {
  return Object.fromEntries(e.issues.map((i) => [i.path.join("."), i.message]));
}

const revalidate = () => {
  revalidatePath("/purchasing");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
};

// ── Suppliers ──────────────────────────────────────────────────────────────

export async function createSupplierAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = supplierSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("suppliers:create");
    const supplier = await supplierService.create(ctx, parsed.data);
    revalidatePath("/purchasing");
    return { id: supplier.id };
  });
}

export async function updateSupplierAction(id: string, raw: unknown): Promise<Result<null>> {
  const parsed = supplierSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("suppliers:update");
    await supplierService.update(ctx, id, parsed.data);
    revalidatePath("/purchasing");
    return null;
  });
}

export async function deleteSupplierAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("suppliers:delete");
    await supplierService.remove(ctx, id);
    revalidatePath("/purchasing");
    return null;
  });
}

// ── Purchase orders ────────────────────────────────────────────────────────

export async function createPurchaseOrderAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = purchaseOrderSchema.safeParse(raw);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid order.");
  }
  return guard(async () => {
    const ctx = await requirePermission("purchasing:create");
    const po = await purchasingService.createOrder(ctx, parsed.data);
    revalidatePath("/purchasing");
    return { id: po.id };
  });
}

export async function approvePurchaseOrderAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("purchasing:approve");
    await purchasingService.approveOrder(ctx, id);
    revalidatePath("/purchasing");
    return null;
  });
}

export async function cancelPurchaseOrderAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("purchasing:update");
    await purchasingService.cancelOrder(ctx, id);
    revalidatePath("/purchasing");
    return null;
  });
}

export async function receiveGoodsAction(raw: unknown): Promise<Result<null>> {
  const parsed = receiveGoodsSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid receipt.");
  return guard(async () => {
    const ctx = await requirePermission("purchasing:update");
    await purchasingService.receiveGoods(ctx, parsed.data);
    revalidate();
    return null;
  });
}
