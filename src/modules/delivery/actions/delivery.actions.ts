"use server";

import { revalidatePath } from "next/cache";
import { guard, err, type Result } from "@/lib/result";
import { requirePermission } from "@/lib/auth/context";
import {
  riderSchema,
  zoneSchema,
  assignRiderSchema,
  deliveryStatusSchema,
  confirmDeliverySchema,
} from "../dto/delivery.dto";
import { deliveryService } from "../service/delivery.service";

function zodFields(e: import("zod").ZodError): Record<string, string> {
  return Object.fromEntries(e.issues.map((i) => [i.path.join("."), i.message]));
}

export async function assignRiderAction(
  raw: unknown,
): Promise<Result<{ otpCode: string | null }>> {
  const parsed = assignRiderSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("delivery:update");
    const result = await deliveryService.assign(ctx, parsed.data);
    revalidatePath("/delivery");
    return result;
  });
}

export async function setDeliveryStatusAction(raw: unknown): Promise<Result<null>> {
  const parsed = deliveryStatusSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("delivery:update");
    await deliveryService.setStatus(ctx, parsed.data);
    revalidatePath("/delivery");
    return null;
  });
}

export async function confirmDeliveryAction(raw: unknown): Promise<Result<null>> {
  const parsed = confirmDeliverySchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("delivery:update");
    await deliveryService.confirm(ctx, parsed.data);
    revalidatePath("/delivery");
    return null;
  });
}

export async function createRiderAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = riderSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("delivery:create");
    const rider = await deliveryService.createRider(ctx, parsed.data);
    revalidatePath("/delivery");
    return { id: rider.id };
  });
}

export async function updateRiderAction(id: string, raw: unknown): Promise<Result<null>> {
  const parsed = riderSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("delivery:update");
    await deliveryService.updateRider(ctx, id, parsed.data);
    revalidatePath("/delivery");
    return null;
  });
}

export async function deleteRiderAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("delivery:delete");
    await deliveryService.removeRider(ctx, id);
    revalidatePath("/delivery");
    return null;
  });
}

export async function createZoneAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = zoneSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("delivery:create");
    const zone = await deliveryService.createZone(ctx, parsed.data);
    revalidatePath("/delivery");
    return { id: zone.id };
  });
}

export async function updateZoneAction(id: string, raw: unknown): Promise<Result<null>> {
  const parsed = zoneSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("delivery:update");
    await deliveryService.updateZone(ctx, id, parsed.data);
    revalidatePath("/delivery");
    return null;
  });
}

export async function deleteZoneAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("delivery:delete");
    await deliveryService.removeZone(ctx, id);
    revalidatePath("/delivery");
    return null;
  });
}

/**
 * Zones for the POS delivery picker. Gated on `orders:create` rather than
 * `delivery:view` — cashiers and waiters place delivery orders but are not
 * granted the delivery resource, and they need the fee/ETA list to do it.
 */
export async function listDeliveryZonesAction(): Promise<
  Result<
    Array<{
      id: string;
      name: string;
      deliveryFee: number;
      minOrderAmount: number;
      etaMinutes: number;
    }>
  >
> {
  return guard(async () => {
    const ctx = await requirePermission("orders:create");
    return deliveryService.zones(ctx);
  });
}
