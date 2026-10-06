"use server";

import { revalidatePath } from "next/cache";
import { guard, err, type Result } from "@/lib/result";
import { requirePermission } from "@/lib/auth/context";
import {
  organizationSchema,
  branchSchema,
  createUserSchema,
  updateUserSchema,
  roleSchema,
} from "../dto/settings.dto";
import { settingsService } from "../service/settings.service";

function zodFields(e: import("zod").ZodError): Record<string, string> {
  return Object.fromEntries(e.issues.map((i) => [i.path.join("."), i.message]));
}

export async function updateOrganizationAction(raw: unknown): Promise<Result<null>> {
  const parsed = organizationSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("settings:manage");
    await settingsService.updateOrganization(ctx, parsed.data);
    revalidatePath("/settings");
    return null;
  });
}

export async function createBranchAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = branchSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("settings:manage");
    const branch = await settingsService.createBranch(ctx, parsed.data);
    revalidatePath("/settings");
    return { id: branch.id };
  });
}

export async function updateBranchAction(id: string, raw: unknown): Promise<Result<null>> {
  const parsed = branchSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("settings:manage");
    await settingsService.updateBranch(ctx, id, parsed.data);
    revalidatePath("/settings");
    return null;
  });
}

export async function deleteBranchAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("settings:manage");
    await settingsService.removeBranch(ctx, id);
    revalidatePath("/settings");
    return null;
  });
}

export async function createUserAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = createUserSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("users:create");
    const user = await settingsService.createUser(ctx, parsed.data);
    revalidatePath("/settings");
    return { id: user.id };
  });
}

export async function updateUserAction(id: string, raw: unknown): Promise<Result<null>> {
  const parsed = updateUserSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("users:update");
    await settingsService.updateUser(ctx, id, parsed.data);
    revalidatePath("/settings");
    return null;
  });
}

export async function deleteUserAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("users:delete");
    await settingsService.removeUser(ctx, id);
    revalidatePath("/settings");
    return null;
  });
}

export async function createRoleAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = roleSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("users:manage");
    const role = await settingsService.createRole(ctx, parsed.data);
    revalidatePath("/settings");
    return { id: role.id };
  });
}

export async function updateRoleAction(id: string, raw: unknown): Promise<Result<null>> {
  const parsed = roleSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("users:manage");
    await settingsService.updateRole(ctx, id, parsed.data);
    revalidatePath("/settings");
    return null;
  });
}

export async function deleteRoleAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("users:manage");
    await settingsService.removeRole(ctx, id);
    revalidatePath("/settings");
    return null;
  });
}
