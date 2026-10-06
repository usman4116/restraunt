import { prisma } from "@/lib/prisma";
import { tenantWhere, type TenantContext } from "@/lib/auth/context";
import type { Prisma } from "@/generated/prisma/client";
import type { ListQuery } from "../dto/menu.dto";

const SORTABLE = new Set(["name", "basePrice", "createdAt", "sortOrder"]);

function orderBy(sort: string): Prisma.MenuItemOrderByWithRelationInput {
  const desc = sort.startsWith("-");
  const field = desc ? sort.slice(1) : sort;
  if (!SORTABLE.has(field)) return { createdAt: "desc" };
  return { [field]: desc ? "desc" : "asc" };
}

export const menuRepository = {
  listCategories(ctx: TenantContext) {
    return prisma.menuCategory.findMany({
      where: tenantWhere(ctx),
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { items: { where: { deletedAt: null } } } } },
    });
  },

  findCategory(ctx: TenantContext, id: string) {
    return prisma.menuCategory.findFirst({ where: { ...tenantWhere(ctx), id } });
  },

  createCategory(ctx: TenantContext, data: Prisma.MenuCategoryUncheckedCreateInput) {
    return prisma.menuCategory.create({
      data: { ...data, organizationId: ctx.organizationId, createdById: ctx.userId },
    });
  },

  updateCategory(ctx: TenantContext, id: string, data: Prisma.MenuCategoryUncheckedUpdateInput) {
    return prisma.menuCategory.updateMany({
      where: { ...tenantWhere(ctx), id },
      data: { ...data, updatedById: ctx.userId },
    });
  },

  softDeleteCategory(ctx: TenantContext, id: string) {
    return prisma.menuCategory.updateMany({
      where: { ...tenantWhere(ctx), id },
      data: { deletedAt: new Date(), updatedById: ctx.userId },
    });
  },

  async listItems(ctx: TenantContext, query: ListQuery) {
    const where: Prisma.MenuItemWhereInput = {
      ...tenantWhere(ctx),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { sku: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.menuItem.findMany({
        where,
        orderBy: orderBy(query.sort),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          category: { select: { id: true, name: true } },
          variants: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
        },
      }),
      prisma.menuItem.count({ where }),
    ]);

    return { items, total };
  },

  findItem(ctx: TenantContext, id: string) {
    return prisma.menuItem.findFirst({
      where: { ...tenantWhere(ctx), id },
      include: {
        category: { select: { id: true, name: true } },
        variants: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
        modifierGroups: { include: { group: { include: { modifiers: true } } } },
      },
    });
  },

  createItem(
    ctx: TenantContext,
    data: Omit<Prisma.MenuItemUncheckedCreateInput, "organizationId">,
    variants: { name: string; priceDelta: number; isDefault: boolean }[],
  ) {
    return prisma.menuItem.create({
      data: {
        ...data,
        organizationId: ctx.organizationId,
        createdById: ctx.userId,
        variants: {
          create: variants.map((v, i) => ({ ...v, sortOrder: i })),
        },
      },
      include: { variants: true },
    });
  },

  async updateItem(
    ctx: TenantContext,
    id: string,
    data: Prisma.MenuItemUncheckedUpdateInput,
    variants?: { id?: string; name: string; priceDelta: number; isDefault: boolean }[],
  ) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.menuItem.findFirst({ where: { ...tenantWhere(ctx), id } });
      if (!existing) return null;

      await tx.menuItem.update({
        where: { id },
        data: { ...data, updatedById: ctx.userId },
      });

      if (variants) {
        const keepIds = variants.filter((v) => v.id).map((v) => v.id as string);
        await tx.menuItemVariant.updateMany({
          where: { menuItemId: id, id: { notIn: keepIds } },
          data: { deletedAt: new Date() },
        });
        for (const [i, v] of variants.entries()) {
          if (v.id) {
            await tx.menuItemVariant.update({
              where: { id: v.id },
              data: { name: v.name, priceDelta: v.priceDelta, isDefault: v.isDefault, sortOrder: i },
            });
          } else {
            await tx.menuItemVariant.create({
              data: { menuItemId: id, name: v.name, priceDelta: v.priceDelta, isDefault: v.isDefault, sortOrder: i },
            });
          }
        }
      }

      return tx.menuItem.findFirst({
        where: { id },
        include: { variants: { where: { deletedAt: null } } },
      });
    });
  },

  softDeleteItem(ctx: TenantContext, id: string) {
    return prisma.menuItem.updateMany({
      where: { ...tenantWhere(ctx), id },
      data: { deletedAt: new Date(), updatedById: ctx.userId },
    });
  },
};
