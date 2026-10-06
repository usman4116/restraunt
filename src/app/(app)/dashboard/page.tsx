import type { Metadata } from "next";
import {
  Banknote,
  ReceiptText,
  Calculator,
  ChefHat,
  PackageOpen,
  CalendarClock,
} from "lucide-react";
import { requirePermission } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { getDashboardKpis } from "@/modules/dashboard/service/dashboard.service";
import { StatTile } from "@/components/ui/stat-tile";
import { WeeklyCharts } from "@/modules/dashboard/components/weekly-charts";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await requirePermission("dashboard:view");
  const [kpis, org] = await Promise.all([
    getDashboardKpis(ctx),
    prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { currency: true },
    }),
  ]);

  const currency = org?.currency ?? "USD";
  const money = (n: number) =>
    new Intl.NumberFormat("en", { style: "currency", currency }).format(n);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Live overview of your restaurant&apos;s performance
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Revenue today" value={money(kpis.todayRevenue)} icon={Banknote} />
        <StatTile label="Orders today" value={String(kpis.todayOrders)} icon={ReceiptText} />
        <StatTile label="Avg order value" value={money(kpis.avgOrderValue)} icon={Calculator} />
        <StatTile
          label="Kitchen queue"
          value={String(kpis.openKitchenTickets)}
          hint="New & cooking"
          icon={ChefHat}
          tone={kpis.openKitchenTickets > 10 ? "warning" : "default"}
        />
        <StatTile
          label="Low stock"
          value={String(kpis.lowStockItems)}
          hint="At or below reorder level"
          icon={PackageOpen}
          tone={kpis.lowStockItems > 0 ? "critical" : "default"}
        />
        <StatTile
          label="Upcoming reservations"
          value={String(kpis.upcomingReservations)}
          icon={CalendarClock}
        />
      </div>

      <WeeklyCharts data={kpis.weeklySales} currency={currency} />
    </div>
  );
}
