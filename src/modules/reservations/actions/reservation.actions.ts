"use server";

import { revalidatePath } from "next/cache";
import { guard, err, type Result } from "@/lib/result";
import { requirePermission } from "@/lib/auth/context";
import {
  reservationSchema,
  reservationStatusSchema,
  tableSchema,
  sectionSchema,
  tableStatusSchema,
} from "../dto/reservation.dto";
import { reservationService } from "../service/reservation.service";

function zodFields(e: import("zod").ZodError): Record<string, string> {
  return Object.fromEntries(e.issues.map((i) => [i.path.join("."), i.message]));
}

export async function createReservationAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = reservationSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("reservations:create");
    const reservation = await reservationService.create(ctx, parsed.data);
    revalidatePath("/reservations");
    return { id: reservation.id };
  });
}

export async function updateReservationAction(id: string, raw: unknown): Promise<Result<null>> {
  const parsed = reservationSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("reservations:update");
    await reservationService.update(ctx, id, parsed.data);
    revalidatePath("/reservations");
    return null;
  });
}

export async function setReservationStatusAction(raw: unknown): Promise<Result<null>> {
  const parsed = reservationStatusSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("reservations:update");
    await reservationService.setStatus(ctx, parsed.data);
    revalidatePath("/reservations");
    return null;
  });
}

export async function deleteReservationAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("reservations:delete");
    await reservationService.remove(ctx, id);
    revalidatePath("/reservations");
    return null;
  });
}

export async function createSectionAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = sectionSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("reservations:create");
    const section = await reservationService.createSection(ctx, parsed.data);
    revalidatePath("/reservations");
    return { id: section.id };
  });
}

export async function createTableAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = tableSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("reservations:create");
    const table = await reservationService.createTable(ctx, parsed.data);
    revalidatePath("/reservations");
    return { id: table.id };
  });
}

export async function setTableStatusAction(raw: unknown): Promise<Result<null>> {
  const parsed = tableStatusSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("reservations:update");
    await reservationService.setTableStatus(ctx, parsed.data);
    revalidatePath("/reservations");
    return null;
  });
}
