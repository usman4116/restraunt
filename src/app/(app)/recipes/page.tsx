import type { Metadata } from "next";
import { requirePermission, tenantWhere } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { recipeService } from "@/modules/recipes/service/recipe.service";
import { RecipeManager } from "@/modules/recipes/components/recipe-manager";

export const metadata: Metadata = { title: "Recipes" };
export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const ctx = await requirePermission("recipes:view");

  const [rows, ingredients] = await Promise.all([
    recipeService.listForMenu(ctx),
    prisma.inventoryItem.findMany({
      where: { ...tenantWhere(ctx), status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true, avgCost: true },
    }),
  ]);

  return (
    <RecipeManager
      rows={rows}
      ingredients={ingredients.map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
        avgCost: Number(i.avgCost),
      }))}
    />
  );
}
