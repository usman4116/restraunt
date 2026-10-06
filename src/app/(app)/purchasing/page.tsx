import type { Metadata } from "next";
import { requirePermission, tenantWhere } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import {
  supplierService,
  purchasingService,
} from "@/modules/purchasing/service/purchasing.service";
import { PurchasingManager } from "@/modules/purchasing/components/purchasing-manager";

export const metadata: Metadata = { title: "Purchasing" };
export const dynamic = "force-dynamic";

export default async function PurchasingPage() {
  const ctx = await requirePermission("purchasing:view");

  const [orders, suppliers, items] = await Promise.all([
    purchasingService.listOrders(ctx),
    supplierService.list(ctx),
    prisma.inventoryItem.findMany({
      where: { ...tenantWhere(ctx), status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true, lastCost: true },
    }),
  ]);

  return (
    <PurchasingManager
      orders={orders.map((po) => ({
        id: po.id,
        poNumber: po.poNumber,
        supplierName: po.supplier.name,
        poStatus: po.poStatus,
        expectedDate: po.expectedDate?.toISOString() ?? null,
        totalAmount: Number(po.totalAmount),
        createdAt: po.createdAt.toISOString(),
        items: po.items.map((line) => ({
          id: line.id,
          name: line.item.name,
          unit: line.item.unit,
          quantity: Number(line.quantity),
          receivedQty: Number(line.receivedQty),
          unitCost: Number(line.unitCost),
        })),
      }))}
      suppliers={suppliers.map((s) => ({
        id: s.id,
        name: s.name,
        contactName: s.contactName,
        email: s.email,
        phone: s.phone,
        address: s.address,
        paymentTermsDays: s.paymentTermsDays,
        orderCount: s._count.purchaseOrders,
      }))}
      items={items.map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
        lastCost: Number(i.lastCost),
      }))}
    />
  );
}
