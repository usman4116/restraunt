import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { inventoryService } from "@/modules/inventory/service/inventory.service";
import { inventoryListQuerySchema } from "@/modules/inventory/dto/inventory.dto";
import { InventoryManager } from "@/modules/inventory/components/inventory-manager";

export const metadata: Metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function InventoryPage({ searchParams }: Props) {
  const ctx = await requirePermission("inventory:view");
  const params = await searchParams;
  const query = inventoryListQuerySchema.parse({
    page: params.page,
    search: typeof params.search === "string" ? params.search : undefined,
    lowStockOnly: params.low === "1",
  });

  const { items, total } = await inventoryService.list(ctx, query);

  return (
    <InventoryManager items={items} total={total} page={query.page} pageSize={query.pageSize} />
  );
}
