"use server";

import { revalidatePath } from "next/cache";
import { guard, err, type Result } from "@/lib/result";
import { requirePermission } from "@/lib/auth/context";
import { recipeSchema } from "../dto/recipe.dto";
import { recipeService } from "../service/recipe.service";

export async function saveRecipeAction(raw: unknown): Promise<Result<{ id: string; version: number }>> {
  const parsed = recipeSchema.safeParse(raw);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid recipe.");
  }
  return guard(async () => {
    const ctx = await requirePermission("recipes:update");
    const recipe = await recipeService.save(ctx, parsed.data);
    revalidatePath("/recipes");
    return { id: recipe.id, version: recipe.version };
  });
}

export async function getRecipeAction(menuItemId: string) {
  return guard(async () => {
    const ctx = await requirePermission("recipes:view");
    return recipeService.getForMenuItem(ctx, menuItemId);
  });
}
