import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/cache";
import type { TenantContext } from "@/lib/auth/context";

export interface DashboardKpis {
  todayRevenue: number;
  todayOrders: number;
  avgOrderValue: number;
  openKitchenTickets: number;
  lowStockItems: number;
  upcomingReservations: number;
  weeklySales: { day: string; revenue: number; orders: number }[];
}

const COMPLETED = ["COMPLETED", "SERVED"] as const;

export function getDashboardKpis(ctx: TenantContext): Promise<DashboardKpis> {
  const cacheKey = `dash:${ctx.organizationId}:${ctx.branchId ?? "all"}`;
  return cached(cacheKey, 60, async () => {
    const branchFilter = ctx.branchId ? { branchId: ctx.branchId } : {};
    const orgFilter = { organizationId: ctx.organizationId, deletedAt: null, ...branchFilter };

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const weekAgo = new Date(startOfDay);
    weekAgo.setDate(weekAgo.getDate() - 6);

    const [todayAgg, openTickets, lowStock, reservations, weekOrders] = await Promise.all([
      prisma.order.aggregate({
        where: { ...orgFilter, orderStatus: { in: [...COMPLETED] }, createdAt: { gte: startOfDay } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.kitchenTicket.count({
        where: {
          organizationId: ctx.organizationId,
          ...branchFilter,
          ticketStatus: { in: ["NEW", "COOKING"] },
        },
      }),
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count
        FROM inventory_items i
        WHERE i."organizationId" = ${ctx.organizationId}::uuid
          AND i."deletedAt" IS NULL
          AND i."reorderLevel" > 0
          AND COALESCE(
            (SELECT SUM(s."quantity") FROM stock_levels s WHERE s."inventoryItemId" = i.id), 0
          ) <= i."reorderLevel"
      `,
      prisma.reservation.count({
        where: {
          organizationId: ctx.organizationId,
          ...branchFilter,
          deletedAt: null,
          resStatus: { in: ["PENDING", "CONFIRMED"] },
          reservedAt: { gte: new Date() },
        },
      }),
      prisma.order.findMany({
        where: { ...orgFilter, orderStatus: { in: [...COMPLETED] }, createdAt: { gte: weekAgo } },
        select: { createdAt: true, totalAmount: true },
      }),
    ]);

    const todayRevenue = Number(todayAgg._sum.totalAmount ?? 0);
    const todayOrders = todayAgg._count;

    const weeklySales: DashboardKpis["weeklySales"] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekAgo);
      day.setDate(day.getDate() + i);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      const dayOrders = weekOrders.filter((o) => o.createdAt >= day && o.createdAt < next);
      weeklySales.push({
        day: day.toLocaleDateString("en", { weekday: "short" }),
        revenue: dayOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0),
        orders: dayOrders.length,
      });
    }

    return {
      todayRevenue,
      todayOrders,
      avgOrderValue: todayOrders ? todayRevenue / todayOrders : 0,
      openKitchenTickets: openTickets,
      lowStockItems: Number(lowStock[0]?.count ?? 0),
      upcomingReservations: reservations,
      weeklySales,
    };
  });
}
