import { DomainError } from "@/lib/result";
import { audit } from "@/lib/audit";
import { kv } from "@/lib/cache";
import type { TenantContext } from "@/lib/auth/context";
import { menuRepository } from "../repository/menu.repository";
import type { CategoryInput, MenuItemInput, ListQuery } from "../dto/menu.dto";

const invalidateMenuCache = (ctx: TenantContext) =>
  kv.del(`menu:${ctx.organizationId}`).catch(() => undefined);

export const menuService = {
  listCategories: (ctx: TenantContext) => menuRepository.listCategories(ctx),

  async createCategory(ctx: TenantContext, input: CategoryInput) {
    const category = await menuRepository.createCategory(ctx, {
      name: input.name,
      description: input.description || null,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder,
      organizationId: ctx.organizationId,
    });
    audit(ctx, { action: "menu.category.create", entityType: "MenuCategory", entityId: category.id, after: category });
    await invalidateMenuCache(ctx);
    return category;
  },

  async updateCategory(ctx: TenantContext, id: string, input: CategoryInput) {
    const before = await menuRepository.findCategory(ctx, id);
    if (!before) throw new DomainError("NOT_FOUND", "Category not found.");
    await menuRepository.updateCategory(ctx, id, {
      name: input.name,
      description: input.description || null,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder,
    });
    audit(ctx, { action: "menu.category.update", entityType: "MenuCategory", entityId: id, before, after: input });
    await invalidateMenuCache(ctx);
  },

  async deleteCategory(ctx: TenantContext, id: string) {
    const before = await menuRepository.findCategory(ctx, id);
    if (!before) throw new DomainError("NOT_FOUND", "Category not found.");
    await menuRepository.softDeleteCategory(ctx, id);
    audit(ctx, { action: "menu.category.delete", entityType: "MenuCategory", entityId: id, before });
    await invalidateMenuCache(ctx);
  },

  listItems: (ctx: TenantContext, query: ListQuery) => menuRepository.listItems(ctx, query),

  async createItem(ctx: TenantContext, input: MenuItemInput) {
    const category = await menuRepository.findCategory(ctx, input.categoryId);
    if (!category) throw new DomainError("VALIDATION_ERROR", "Category not found.", { categoryId: "Invalid category" });

    const item = await menuRepository.createItem(
      ctx,
      {
        name: input.name,
        categoryId: input.categoryId,
        description: input.description || null,
        sku: input.sku || null,
        basePrice: input.basePrice,
        taxRate: input.taxRate,
        prepTimeMinutes: input.prepTimeMinutes ?? null,
        allergens: input.allergens,
        tags: input.tags,
      },
      input.variants,
    );
    audit(ctx, { action: "menu.item.create", entityType: "MenuItem", entityId: item.id, after: item });
    await invalidateMenuCache(ctx);
    return item;
  },

  async updateItem(ctx: TenantContext, id: string, input: MenuItemInput) {
    const category = await menuRepository.findCategory(ctx, input.categoryId);
    if (!category) throw new DomainError("VALIDATION_ERROR", "Category not found.", { categoryId: "Invalid category" });

    const updated = await menuRepository.updateItem(
      ctx,
      id,
      {
        name: input.name,
        categoryId: input.categoryId,
        description: input.description || null,
        sku: input.sku || null,
        basePrice: input.basePrice,
        taxRate: input.taxRate,
        prepTimeMinutes: input.prepTimeMinutes ?? null,
        allergens: input.allergens,
        tags: input.tags,
      },
      input.variants,
    );
    if (!updated) throw new DomainError("NOT_FOUND", "Menu item not found.");
    audit(ctx, { action: "menu.item.update", entityType: "MenuItem", entityId: id, after: input });
    await invalidateMenuCache(ctx);
    return updated;
  },

  async deleteItem(ctx: TenantContext, id: string) {
    const result = await menuRepository.softDeleteItem(ctx, id);
    if (result.count === 0) throw new DomainError("NOT_FOUND", "Menu item not found.");
    audit(ctx, { action: "menu.item.delete", entityType: "MenuItem", entityId: id });
    await invalidateMenuCache(ctx);
  },
};
