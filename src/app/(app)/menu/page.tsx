import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { menuService } from "@/modules/menu/service/menu.service";
import { listQuerySchema } from "@/modules/menu/dto/menu.dto";
import { MenuManager } from "@/modules/menu/components/menu-manager";

export const metadata: Metadata = { title: "Menu" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MenuPage({ searchParams }: Props) {
  const ctx = await requirePermission("menu:view");
  const params = await searchParams;
  const query = listQuerySchema.parse({
    page: params.page,
    pageSize: params.pageSize,
    search: typeof params.search === "string" ? params.search : undefined,
    categoryId: typeof params.categoryId === "string" ? params.categoryId : undefined,
    sort: typeof params.sort === "string" ? params.sort : undefined,
  });

  const [categories, { items, total }] = await Promise.all([
    menuService.listCategories(ctx),
    menuService.listItems(ctx, query),
  ]);

  return (
    <MenuManager
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        itemCount: c._count.items,
        sortOrder: c.sortOrder,
      }))}
      items={items.map((i) => ({
        id: i.id,
        name: i.name,
        sku: i.sku,
        categoryId: i.categoryId,
        categoryName: i.category.name,
        basePrice: Number(i.basePrice),
        taxRate: Number(i.taxRate),
        status: i.status,
        allergens: i.allergens,
        tags: i.tags,
        description: i.description,
        prepTimeMinutes: i.prepTimeMinutes,
        variants: i.variants.map((v) => ({
          id: v.id,
          name: v.name,
          priceDelta: Number(v.priceDelta),
          isDefault: v.isDefault,
        })),
      }))}
      total={total}
      page={query.page}
      pageSize={query.pageSize}
    />
  );
}
