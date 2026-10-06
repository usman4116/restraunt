import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { menuService } from "@/modules/menu/service/menu.service";
import { PosScreen } from "@/modules/orders/components/pos-screen";

export const metadata: Metadata = { title: "POS" };
export const dynamic = "force-dynamic";

export default async function PosPage() {
  const ctx = await requirePermission("pos:view");
  const [categories, { items }] = await Promise.all([
    menuService.listCategories(ctx),
    menuService.listItems(ctx, { page: 1, pageSize: 100, sort: "sortOrder" }),
  ]);

  return (
    <PosScreen
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      items={items
        .filter((i) => i.status === "ACTIVE")
        .map((i) => ({
          id: i.id,
          name: i.name,
          categoryId: i.categoryId,
          basePrice: Number(i.basePrice),
          taxRate: Number(i.taxRate),
          variants: i.variants.map((v) => ({
            id: v.id,
            name: v.name,
            priceDelta: Number(v.priceDelta),
          })),
        }))}
    />
  );
}
