import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { audit } from "@/lib/audit";
import { tenantWhere, type TenantContext } from "@/lib/auth/context";
import type { Prisma } from "@/generated/prisma/client";
import type {
  InventoryItemInput,
  StockAdjustmentInput,
  InventoryListQuery,
} from "../dto/inventory.dto";

/** Default warehouse for the context branch (created on demand). */
export async function ensureDefaultWarehouse(
  ctx: TenantContext,
  tx: Prisma.TransactionClient = prisma,
) {
  const existing = await tx.warehouse.findFirst({
    where: {
      organizationId: ctx.organizationId,
      deletedAt: null,
      OR: [{ branchId: ctx.branchId }, { branchId: null }],
    },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  return tx.warehouse.create({
    data: {
      organizationId: ctx.organizationId,
      branchId: ctx.branchId,
      name: "Main Store",
      code: `WH-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    },
  });
}

export const inventoryService = {
  async list(ctx: TenantContext, query: InventoryListQuery) {
    const where: Prisma.InventoryItemWhereInput = {
      ...tenantWhere(ctx),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { sku: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.inventoryItem.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { stockLevels: { select: { quantity: true } } },
      }),
      prisma.inventoryItem.count({ where }),
    ]);

    const rows = items.map((item) => {
      const onHand = item.stockLevels.reduce((sum, level) => sum + Number(level.quantity), 0);
      return {
        id: item.id,
        name: item.name,
        sku: item.sku,
        categoryName: item.categoryName,
        unit: item.unit,
        onHand,
        reorderLevel: Number(item.reorderLevel),
        reorderQty: Number(item.reorderQty),
        avgCost: Number(item.avgCost),
        lastCost: Number(item.lastCost),
        stockValue: onHand * Number(item.avgCost),
        isLow: Number(item.reorderLevel) > 0 && onHand <= Number(item.reorderLevel),
      };
    });

    return {
      items: query.lowStockOnly ? rows.filter((r) => r.isLow) : rows,
      total,
    };
  },

  async create(ctx: TenantContext, input: InventoryItemInput) {
    const duplicate = await prisma.inventoryItem.findFirst({
      where: { organizationId: ctx.organizationId, sku: input.sku, deletedAt: null },
    });
    if (duplicate) {
      throw new DomainError("CONFLICT", "SKU already exists.", { sku: "Already in use" });
    }
    const item = await prisma.inventoryItem.create({
      data: {
        organizationId: ctx.organizationId,
        name: input.name,
        sku: input.sku,
        categoryName: input.categoryName || null,
        unit: input.unit,
        reorderLevel: input.reorderLevel,
        reorderQty: input.reorderQty,
        lastCost: input.lastCost,
        avgCost: input.lastCost,
        shelfLifeDays: input.shelfLifeDays ?? null,
        createdById: ctx.userId,
      },
    });
    audit(ctx, { action: "inventory.item.create", entityType: "InventoryItem", entityId: item.id, after: item });
    return item;
  },

  async update(ctx: TenantContext, id: string, input: InventoryItemInput) {
    const before = await prisma.inventoryItem.findFirst({ where: { ...tenantWhere(ctx), id } });
    if (!before) throw new DomainError("NOT_FOUND", "Inventory item not found.");
    await prisma.inventoryItem.update({
      where: { id },
      data: {
        name: input.name,
        sku: input.sku,
        categoryName: input.categoryName || null,
        unit: input.unit,
        reorderLevel: input.reorderLevel,
        reorderQty: input.reorderQty,
        lastCost: input.lastCost,
        shelfLifeDays: input.shelfLifeDays ?? null,
        updatedById: ctx.userId,
      },
    });
    audit(ctx, { action: "inventory.item.update", entityType: "InventoryItem", entityId: id, before, after: input });
  },

  async remove(ctx: TenantContext, id: string) {
    const result = await prisma.inventoryItem.updateMany({
      where: { ...tenantWhere(ctx), id },
      data: { deletedAt: new Date(), updatedById: ctx.userId },
    });
    if (result.count === 0) throw new DomainError("NOT_FOUND", "Inventory item not found.");
    audit(ctx, { action: "inventory.item.delete", entityType: "InventoryItem", entityId: id });
  },

  /** Manual adjustment / waste / spoilage. Writes the ledger and maintains StockLevel. */
  async adjustStock(ctx: TenantContext, input: StockAdjustmentInput) {
    const item = await prisma.inventoryItem.findFirst({
      where: { ...tenantWhere(ctx), id: input.inventoryItemId },
    });
    if (!item) throw new DomainError("NOT_FOUND", "Inventory item not found.");

    // Waste and spoilage always reduce stock
    const quantity =
      input.type === "ADJUSTMENT" ? input.quantity : -Math.abs(input.quantity);

    await prisma.$transaction(async (tx) => {
      const warehouse = await ensureDefaultWarehouse(ctx, tx);
      await tx.stockMovement.create({
        data: {
          organizationId: ctx.organizationId,
          branchId: ctx.branchId,
          warehouseId: warehouse.id,
          inventoryItemId: item.id,
          type: input.type,
          quantity,
          unitCost: item.avgCost,
          note: input.note || null,
          createdById: ctx.userId,
        },
      });
      await tx.stockLevel.upsert({
        where: {
          warehouseId_inventoryItemId: {
            warehouseId: warehouse.id,
            inventoryItemId: item.id,
          },
        },
        create: {
          organizationId: ctx.organizationId,
          warehouseId: warehouse.id,
          inventoryItemId: item.id,
          quantity,
        },
        update: { quantity: { increment: quantity } },
      });
    });

    audit(ctx, {
      action: `inventory.stock.${input.type.toLowerCase()}`,
      entityType: "InventoryItem",
      entityId: item.id,
      after: { quantity, note: input.note },
    });
  },

  /** Recent ledger entries for an item. */
  listMovements(ctx: TenantContext, inventoryItemId: string, limit = 30) {
    return prisma.stockMovement.findMany({
      where: { organizationId: ctx.organizationId, inventoryItemId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },
};
