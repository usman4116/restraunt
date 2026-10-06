import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { audit } from "@/lib/audit";
import { tenantWhere, type TenantContext } from "@/lib/auth/context";
import { ensureDefaultWarehouse } from "@/modules/inventory/service/inventory.service";
import type { RecipeInput } from "../dto/recipe.dto";

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Food cost for one yield of the recipe: Σ qty × (1 + waste%) × avgCost. */
export function computeFoodCost(
  rows: { quantity: number; wastePercent: number }[],
  costByItem: Map<string, number>,
  itemIds: string[],
) {
  return round4(
    rows.reduce((sum, row, i) => {
      const unitCost = costByItem.get(itemIds[i]) ?? 0;
      return sum + row.quantity * (1 + row.wastePercent / 100) * unitCost;
    }, 0),
  );
}

export const recipeService = {
  /** Menu items with their active recipe summary (or none) for the recipes screen. */
  async listForMenu(ctx: TenantContext) {
    const menuItems = await prisma.menuItem.findMany({
      where: { ...tenantWhere(ctx), status: "ACTIVE" },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      select: {
        id: true,
        name: true,
        basePrice: true,
        category: { select: { name: true } },
        recipes: {
          where: { isActive: true, deletedAt: null },
          take: 1,
          select: {
            id: true,
            version: true,
            foodCost: true,
            yieldQty: true,
            _count: { select: { ingredients: true } },
          },
        },
      },
    });

    return menuItems.map((m) => {
      const recipe = m.recipes[0] ?? null;
      const price = Number(m.basePrice);
      const costPerServing = recipe
        ? Number(recipe.foodCost) / Number(recipe.yieldQty)
        : null;
      return {
        menuItemId: m.id,
        name: m.name,
        categoryName: m.category?.name ?? null,
        basePrice: price,
        recipeId: recipe?.id ?? null,
        version: recipe?.version ?? null,
        ingredientCount: recipe?._count.ingredients ?? 0,
        costPerServing,
        marginPercent:
          costPerServing !== null && price > 0
            ? Math.round(((price - costPerServing) / price) * 1000) / 10
            : null,
      };
    });
  },

  /** Active recipe with ingredient rows, for editing. */
  async getForMenuItem(ctx: TenantContext, menuItemId: string) {
    const recipe = await prisma.recipe.findFirst({
      where: {
        organizationId: ctx.organizationId,
        menuItemId,
        isActive: true,
        deletedAt: null,
      },
      include: {
        ingredients: {
          include: { item: { select: { name: true, unit: true, avgCost: true } } },
        },
      },
    });
    if (!recipe) return null;
    return {
      id: recipe.id,
      version: recipe.version,
      yieldQty: Number(recipe.yieldQty),
      servingSize: recipe.servingSize,
      prepMinutes: recipe.prepMinutes,
      cookMinutes: recipe.cookMinutes,
      instructions: recipe.instructions as string[],
      foodCost: Number(recipe.foodCost),
      ingredients: recipe.ingredients.map((ing) => ({
        inventoryItemId: ing.inventoryItemId,
        quantity: Number(ing.quantity),
        wastePercent: Number(ing.wastePercent),
        name: ing.item.name,
        unit: ing.item.unit,
        avgCost: Number(ing.item.avgCost),
      })),
    };
  },

  /**
   * Save a recipe. Recipes are immutable per version: saving creates the next
   * version and deactivates the previous one, preserving cost history.
   */
  async save(ctx: TenantContext, input: RecipeInput) {
    const menuItem = await prisma.menuItem.findFirst({
      where: { ...tenantWhere(ctx), id: input.menuItemId },
      select: { id: true },
    });
    if (!menuItem) throw new DomainError("NOT_FOUND", "Menu item not found.");

    const itemIds = input.ingredients.map((row) => row.inventoryItemId);
    const items = await prisma.inventoryItem.findMany({
      where: { ...tenantWhere(ctx), id: { in: itemIds } },
      select: { id: true, avgCost: true },
    });
    if (items.length !== itemIds.length) {
      throw new DomainError("VALIDATION_ERROR", "One of the ingredients no longer exists.");
    }
    const costByItem = new Map(items.map((i) => [i.id, Number(i.avgCost)]));
    const foodCost = computeFoodCost(input.ingredients, costByItem, itemIds);

    const recipe = await prisma.$transaction(async (tx) => {
      const latest = await tx.recipe.findFirst({
        where: { organizationId: ctx.organizationId, menuItemId: input.menuItemId },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      await tx.recipe.updateMany({
        where: { organizationId: ctx.organizationId, menuItemId: input.menuItemId, isActive: true },
        data: { isActive: false },
      });
      return tx.recipe.create({
        data: {
          organizationId: ctx.organizationId,
          menuItemId: input.menuItemId,
          version: (latest?.version ?? 0) + 1,
          isActive: true,
          yieldQty: input.yieldQty,
          servingSize: input.servingSize || null,
          prepMinutes: input.prepMinutes ?? null,
          cookMinutes: input.cookMinutes ?? null,
          instructions: input.instructions,
          foodCost,
          createdById: ctx.userId,
          ingredients: {
            create: input.ingredients.map((row) => ({
              inventoryItemId: row.inventoryItemId,
              quantity: row.quantity,
              wastePercent: row.wastePercent,
            })),
          },
        },
      });
    });

    audit(ctx, {
      action: "recipes.save",
      entityType: "Recipe",
      entityId: recipe.id,
      after: { menuItemId: input.menuItemId, version: recipe.version, foodCost },
    });
    return recipe;
  },
};

/**
 * Deduct ingredients from stock for a completed order, based on each item's
 * active recipe. Writes SALE_CONSUMPTION ledger rows and decrements StockLevel.
 * Idempotent per order — safe to call again if a ticket is re-completed.
 */
export async function consumeStockForOrder(ctx: TenantContext, orderId: string) {
  const alreadyConsumed = await prisma.stockMovement.findFirst({
    where: {
      organizationId: ctx.organizationId,
      type: "SALE_CONSUMPTION",
      referenceType: "order",
      referenceId: orderId,
    },
    select: { id: true },
  });
  if (alreadyConsumed) return;

  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId: ctx.organizationId },
    select: {
      branchId: true,
      items: { select: { menuItemId: true, quantity: true } },
    },
  });
  if (!order) return;

  const menuItemIds = [...new Set(order.items.map((i) => i.menuItemId).filter((id): id is string => !!id))];
  if (menuItemIds.length === 0) return;

  const recipes = await prisma.recipe.findMany({
    where: {
      organizationId: ctx.organizationId,
      menuItemId: { in: menuItemIds },
      isActive: true,
      deletedAt: null,
    },
    include: { ingredients: { include: { item: { select: { avgCost: true } } } } },
  });
  const recipeByMenuItem = new Map(recipes.map((r) => [r.menuItemId, r]));

  // Aggregate consumption per inventory item across all order lines
  const usage = new Map<string, { quantity: number; unitCost: number }>();
  for (const line of order.items) {
    const recipe = line.menuItemId ? recipeByMenuItem.get(line.menuItemId) : undefined;
    if (!recipe) continue;
    const perServing = 1 / Number(recipe.yieldQty);
    for (const ing of recipe.ingredients) {
      const qty =
        Number(ing.quantity) *
        (1 + Number(ing.wastePercent) / 100) *
        perServing *
        Number(line.quantity);
      const prev = usage.get(ing.inventoryItemId);
      usage.set(ing.inventoryItemId, {
        quantity: (prev?.quantity ?? 0) + qty,
        unitCost: Number(ing.item.avgCost),
      });
    }
  }
  if (usage.size === 0) return;

  await prisma.$transaction(async (tx) => {
    const warehouse = await ensureDefaultWarehouse(ctx, tx);
    for (const [inventoryItemId, use] of usage) {
      const quantity = -Math.round(use.quantity * 1000) / 1000;
      await tx.stockMovement.create({
        data: {
          organizationId: ctx.organizationId,
          branchId: order.branchId,
          warehouseId: warehouse.id,
          inventoryItemId,
          type: "SALE_CONSUMPTION",
          quantity,
          unitCost: use.unitCost,
          referenceType: "order",
          referenceId: orderId,
          createdById: ctx.userId,
        },
      });
      await tx.stockLevel.upsert({
        where: { warehouseId_inventoryItemId: { warehouseId: warehouse.id, inventoryItemId } },
        create: {
          organizationId: ctx.organizationId,
          warehouseId: warehouse.id,
          inventoryItemId,
          quantity,
        },
        update: { quantity: { increment: quantity } },
      });
    }
  });
}
