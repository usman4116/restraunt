import { prisma } from "@/lib/prisma";
import { tenantWhere, orgWhere, type TenantContext } from "@/lib/auth/context";
import {
  forecastSales,
  daysUntilStockout,
  mape,
  parseNlQuery,
} from "./forecast.service";
import type {
  SalesForecastResult,
  InventoryPredictionResult,
  DailyDigest,
  InsightCard,
  DigestAlert,
  NlQueryResult,
  ForecastQuery,
} from "../dto/ai.dto";

// ── shared utilities ──────────────────────────────────────────────────────────

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

const pad = (n: number) => String(n).padStart(2, "0");

function isoDate(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function parseDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function endOfDay(iso: string) {
  const d = parseDate(iso);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function formatCurrency(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });
}

const REVENUE_STATUSES = ["COMPLETED", "SERVED"] as const;

// ── sales forecast ────────────────────────────────────────────────────────────

async function salesForecast(
  ctx: TenantContext,
  q: ForecastQuery
): Promise<SalesForecastResult> {
  // Load up to 84 days (12 weeks) of daily order totals for the training window,
  // plus the last 7 days as hold-out for MAPE calculation.
  const totalDays = 91;
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - totalDays);
  const to = new Date();
  to.setUTCDate(to.getUTCDate() - 1); // yesterday is the last historical point

  const orders = await prisma.order.findMany({
    where: {
      ...tenantWhere(ctx),
      ...(q.branchId ? { branchId: q.branchId } : {}),
      orderStatus: { in: [...REVENUE_STATUSES] },
      createdAt: { gte: from, lt: endOfDay(isoDate(to)) },
    },
    select: { totalAmount: true, createdAt: true },
  });

  // Bucket into daily totals.
  const dailyMap = new Map<string, number>();
  for (const order of orders) {
    const key = isoDate(order.createdAt);
    dailyMap.set(key, round2((dailyMap.get(key) ?? 0) + Number(order.totalAmount)));
  }

  // Build a dense ordered array, filling missing days with 0.
  const allDays: number[] = [];
  const allDayKeys: string[] = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    const key = isoDate(cursor);
    allDays.push(dailyMap.get(key) ?? 0);
    allDayKeys.push(key);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Hold out the last 7 observed days for error calculation.
  const holdoutSize = Math.min(7, allDays.length);
  const trainingDays = allDays.slice(0, allDays.length - holdoutSize);
  const holdoutActual = allDays.slice(-holdoutSize);

  let mapeValue: number | undefined;
  if (holdoutSize > 0 && trainingDays.length >= 7) {
    // Predict the hold-out period from the training window.
    const holdoutPredicted = forecastSales(trainingDays, holdoutSize).map(
      (p) => p.predicted
    );
    mapeValue = mape(holdoutActual, holdoutPredicted);
  }

  // Now forecast from the full history.
  const points = forecastSales(allDays, q.horizonDays ?? 7);
  const totalPredicted = round2(points.reduce((s, p) => s + p.predicted, 0));

  return {
    points,
    method: `Weighted ${Math.min(8, Math.floor(allDays.length / 7))}-week moving average + linear trend`,
    mape: mapeValue,
    totalPredicted,
  };
}

// ── inventory predictions ─────────────────────────────────────────────────────

async function inventoryPredictions(ctx: TenantContext): Promise<InventoryPredictionResult> {
  const windowDays = 30;
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - windowDays);

  const [items, movements, stockLevels] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { ...tenantWhere(ctx) },
      select: {
        id: true,
        name: true,
        sku: true,
        unit: true,
        reorderLevel: true,
      },
    }),
    prisma.stockMovement.findMany({
      where: {
        ...orgWhere(ctx),
        type: { in: ["SALE_CONSUMPTION", "WASTE", "SPOILAGE", "ADJUSTMENT"] },
        createdAt: { gte: since },
      },
      select: { inventoryItemId: true, quantity: true },
    }),
    // Sum on-hand quantity across all warehouses per item.
    prisma.stockLevel.groupBy({
      by: ["inventoryItemId"],
      where: { organizationId: ctx.organizationId },
      _sum: { quantity: true },
    }),
  ]);

  const stockByItem = new Map(
    stockLevels.map((s) => [s.inventoryItemId, round2(Number(s._sum.quantity ?? 0))])
  );

  // Sum of outflows per item over the window.
  const consumed = new Map<string, number>();
  for (const m of movements) {
    const qty = Math.abs(Number(m.quantity));
    consumed.set(m.inventoryItemId, round2((consumed.get(m.inventoryItemId) ?? 0) + qty));
  }

  let criticalCount = 0;
  let warningCount = 0;

  const predictions = items.map((item) => {
    const totalConsumed = consumed.get(item.id) ?? 0;
    const avgDailyUse = round2(totalConsumed / windowDays);
    const currentStock = stockByItem.get(item.id) ?? 0;
    const reorderLevel = round2(Number(item.reorderLevel));
    const days = daysUntilStockout(currentStock, avgDailyUse);
    const reorderSuggested = currentStock <= reorderLevel || (days !== Infinity && days <= 3);

    if (days !== Infinity && days <= 1) criticalCount++;
    else if (days !== Infinity && days <= 7) warningCount++;

    return {
      inventoryItemId: item.id,
      name: item.name,
      sku: item.sku ?? "",
      unit: item.unit,
      currentStock,
      avgDailyUse,
      daysUntilStockout: days === Infinity ? 999 : round2(days),
      reorderSuggested,
      reorderLevel,
    };
  });

  // Sort: critical first, then by days ascending.
  predictions.sort((a, b) => {
    if (a.reorderSuggested !== b.reorderSuggested) return a.reorderSuggested ? -1 : 1;
    return a.daysUntilStockout - b.daysUntilStockout;
  });

  return { predictions, criticalCount, warningCount };
}

// ── daily digest ──────────────────────────────────────────────────────────────

async function dailyDigest(ctx: TenantContext, date?: string): Promise<DailyDigest> {
  // "yesterday" relative to the supplied date or today UTC.
  const refDate = date ? parseDate(date) : new Date();
  const yesterday = new Date(refDate);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = isoDate(yesterday);

  // Same weekday last week.
  const lastWeekSameDay = new Date(yesterday);
  lastWeekSameDay.setUTCDate(lastWeekSameDay.getUTCDate() - 7);
  const lastWeekStr = isoDate(lastWeekSameDay);

  // ── orders: yesterday vs same-day-last-week ────────────────────────────────
  const [ydOrders, lwOrders, topOrderItems, voidCount, overdueInvoiceCount] =
    await Promise.all([
      // Yesterday revenue + count.
      prisma.order.aggregate({
        where: {
          ...tenantWhere(ctx),
          orderStatus: { in: [...REVENUE_STATUSES] },
          createdAt: { gte: parseDate(yesterdayStr), lt: endOfDay(yesterdayStr) },
        },
        _sum: { totalAmount: true },
        _count: true,
      }),
      // Same day last week.
      prisma.order.aggregate({
        where: {
          ...tenantWhere(ctx),
          orderStatus: { in: [...REVENUE_STATUSES] },
          createdAt: { gte: parseDate(lastWeekStr), lt: endOfDay(lastWeekStr) },
        },
        _sum: { totalAmount: true },
        _count: true,
      }),
      // Top 5 menu items by quantity yesterday.
      prisma.orderItem.groupBy({
        by: ["menuItemId"],
        where: {
          order: {
            ...tenantWhere(ctx),
            orderStatus: { in: [...REVENUE_STATUSES] },
            createdAt: { gte: parseDate(yesterdayStr), lt: endOfDay(yesterdayStr) },
          },
        },
        _sum: { quantity: true, lineTotal: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5,
      }),
      // Void / refund count yesterday.
      prisma.order.count({
        where: {
          ...tenantWhere(ctx),
          orderStatus: { in: ["CANCELLED", "REFUNDED"] },
          createdAt: { gte: parseDate(yesterdayStr), lt: endOfDay(yesterdayStr) },
        },
      }),
      // Overdue invoices.
      prisma.invoice.count({
        where: {
          ...tenantWhere(ctx),
          invoiceStatus: { in: ["ISSUED", "PARTIALLY_PAID"] },
          dueDate: { lt: parseDate(yesterdayStr) },
        },
      }),
    ]);

  // Resolve menu item names for top products.
  const topItemIds = topOrderItems.map((r) => r.menuItemId).filter(Boolean) as string[];
  const menuItems =
    topItemIds.length > 0
      ? await prisma.menuItem.findMany({
          where: { id: { in: topItemIds } },
          select: { id: true, name: true, category: { select: { name: true } } },
        })
      : [];
  const itemNameMap = new Map(menuItems.map((m) => [m.id, { name: m.name, category: m.category?.name ?? "" }]));

  const topProducts = topOrderItems.map((r) => ({
    name: itemNameMap.get(r.menuItemId!)?.name ?? "Unknown",
    category: itemNameMap.get(r.menuItemId!)?.category ?? "",
    qty: Number(r._sum.quantity ?? 0),
    revenue: round2(Number(r._sum.lineTotal ?? 0)),
  }));

  // ── insights ──────────────────────────────────────────────────────────────
  const ydRevenue = round2(Number(ydOrders._sum.totalAmount ?? 0));
  const lwRevenue = round2(Number(lwOrders._sum.totalAmount ?? 0));
  const ydOrderCount = ydOrders._count;
  const lwOrderCount = lwOrders._count;

  const revDelta = lwRevenue > 0 ? round2(((ydRevenue - lwRevenue) / lwRevenue) * 100) : 0;
  const ordDelta = lwOrderCount > 0 ? round2(((ydOrderCount - lwOrderCount) / lwOrderCount) * 100) : 0;

  const trend = (delta: number): "up" | "down" | "flat" =>
    delta > 1 ? "up" : delta < -1 ? "down" : "flat";

  const insights: InsightCard[] = [
    {
      title: "Yesterday's Revenue",
      value: formatCurrency(ydRevenue),
      raw: ydRevenue,
      delta: revDelta,
      deltaLabel: "vs same day last week",
      trend: trend(revDelta),
      severity: revDelta < -15 ? "warning" : "info",
    },
    {
      title: "Orders",
      value: `${ydOrderCount}`,
      raw: ydOrderCount,
      delta: ordDelta,
      deltaLabel: "vs same day last week",
      trend: trend(ordDelta),
      severity: "info",
    },
    {
      title: "Avg Order Value",
      value: formatCurrency(ydOrderCount > 0 ? round2(ydRevenue / ydOrderCount) : 0),
      raw: ydOrderCount > 0 ? round2(ydRevenue / ydOrderCount) : 0,
      severity: "info",
    },
    {
      title: "Void / Refund",
      value: `${voidCount}`,
      raw: voidCount,
      severity: voidCount >= 5 ? "warning" : voidCount >= 10 ? "critical" : "info",
    },
  ];

  // ── alerts ────────────────────────────────────────────────────────────────
  const alerts: DigestAlert[] = [];

  if (ydRevenue === 0) {
    alerts.push({ type: "no_sales", message: "No revenue recorded yesterday.", severity: "warning" });
  }
  if (overdueInvoiceCount > 0) {
    alerts.push({
      type: "overdue_invoice",
      message: `${overdueInvoiceCount} invoice${overdueInvoiceCount > 1 ? "s are" : " is"} overdue.`,
      severity: "warning",
    });
  }
  if (voidCount >= 5) {
    alerts.push({
      type: "high_void",
      message: `${voidCount} orders voided or refunded yesterday — review with staff.`,
      severity: voidCount >= 10 ? "critical" : "warning",
    });
  }

  // Low stock: join stock levels to find items below their reorder threshold.
  const allItems = await prisma.inventoryItem.findMany({
    where: { ...tenantWhere(ctx) },
    select: { id: true, name: true, reorderLevel: true },
  });
  const allStockLevels = await prisma.stockLevel.groupBy({
    by: ["inventoryItemId"],
    where: { organizationId: ctx.organizationId },
    _sum: { quantity: true },
  });
  const stockMap = new Map(
    allStockLevels.map((s) => [s.inventoryItemId, Number(s._sum.quantity ?? 0)])
  );
  const lowStockItems = allItems.filter(
    (r) => (stockMap.get(r.id) ?? 0) <= Number(r.reorderLevel)
  );

  if (lowStockItems.length > 0) {
    const names = lowStockItems
      .slice(0, 3)
      .map((r) => r.name)
      .join(", ");
    const extra = lowStockItems.length > 3 ? ` +${lowStockItems.length - 3} more` : "";
    alerts.push({
      type: "low_stock",
      message: `Low stock: ${names}${extra}.`,
      severity: lowStockItems.length >= 5 ? "critical" : "warning",
    });
  }

  return {
    date: yesterdayStr,
    insights,
    topProducts,
    alerts,
  };
}

// ── NL query ──────────────────────────────────────────────────────────────────

function nlQuery(_ctx: TenantContext, query: string): NlQueryResult {
  return parseNlQuery(query, isoDate(new Date()));
}

// ── public service object ─────────────────────────────────────────────────────

export const aiInsightsService = {
  salesForecast,
  inventoryPredictions,
  dailyDigest,
  nlQuery,
};
