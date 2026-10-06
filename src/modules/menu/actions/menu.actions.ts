"use server";

import { revalidatePath } from "next/cache";
import { guard, err, type Result } from "@/lib/result";
import { requirePermission } from "@/lib/auth/context";
import { categorySchema, menuItemSchema } from "../dto/menu.dto";
import { menuService } from "../service/menu.service";

function zodFields(e: import("zod").ZodError): Record<string, string> {
  return Object.fromEntries(e.issues.map((i) => [i.path.join("."), i.message]));
}

export async function createCategoryAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("menu:create");
    const category = await menuService.createCategory(ctx, parsed.data);
    revalidatePath("/menu");
    return { id: category.id };
  });
}

export async function updateCategoryAction(id: string, raw: unknown): Promise<Result<null>> {
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("menu:update");
    await menuService.updateCategory(ctx, id, parsed.data);
    revalidatePath("/menu");
    return null;
  });
}

export async function deleteCategoryAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("menu:delete");
    await menuService.deleteCategory(ctx, id);
    revalidatePath("/menu");
    return null;
  });
}

export async function createMenuItemAction(raw: unknown): Promise<Result<{ id: string }>> {
  const parsed = menuItemSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("menu:create");
    const item = await menuService.createItem(ctx, parsed.data);
    revalidatePath("/menu");
    return { id: item.id };
  });
}

export async function updateMenuItemAction(id: string, raw: unknown): Promise<Result<null>> {
  const parsed = menuItemSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("menu:update");
    await menuService.updateItem(ctx, id, parsed.data);
    revalidatePath("/menu");
    return null;
  });
}

export async function deleteMenuItemAction(id: string): Promise<Result<null>> {
  return guard(async () => {
    const ctx = await requirePermission("menu:delete");
    await menuService.deleteItem(ctx, id);
    revalidatePath("/menu");
    return null;
  });
}
