import { prisma } from "@/lib/prisma";
import { tenantWhere, type TenantContext } from "@/lib/auth/context";
import type { ReportQuery, SalesGranularity } from "../dto/reports.dto";

/** Order states that count as realized revenue. */
const REVENUE_STATUSES = ["COMPLETED", "SERVED"] as const;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Parse "YYYY-MM-DD" as UTC midnight; `to` is treated as inclusive end-of-day. */
function parseDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function endOfDay(value: string) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Bucket key for the time axis. Days are the date itself, weeks collapse to the
 * Monday that starts them, months to "YYYY-MM". Keys sort lexicographically in
 * chronological order, which is what the charts rely on.
 */
export function bucketKey(date: Date, granularity: SalesGranularity): string {
  if (granularity === "month") {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
  }
  if (granularity === "week") {
    const monday = new Date(date);
    // getUTCDay(): Sunday is 0, so shift it to the end of the ISO week.
    const offset = (monday.getUTCDay() + 6) % 7;
    monday.setUTCDate(monday.getUTCDate() - offset);
    return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
  }
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Every bucket between from and to, so charts show gaps as zeros, not holes. */
export function bucketRange(from: string, to: string, granularity: SalesGranularity): string[] {
  const keys: string[] = [];
  const cursor = parseDate(from);
  const end = parseDate(to);
  // Snap to the start of the first bucket; stepping from mid-bucket would
  // overshoot the end date and drop the final bucket.
  if (granularity === "month") {
    cursor.setUTCDate(1);
  } else if (granularity === "week") {
    cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7));
  }
  while (cursor <= end) {
    keys.push(bucketKey(cursor, granularity));
    if (granularity === "month") {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    } else {
      cursor.setUTCDate(cursor.getUTCDate() + (granularity === "week" ? 7 : 1));
    }
  }
  return keys;
}

/** Percentage of part in whole, one decimal; 0 when the whole is empty. */
export function percentOf(part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

/** Food cost as a percentage of selling price; the classic kitchen KPI. */
export function foodCostPercent(cost: number, price: number) {
  return percentOf(cost, price);
}

/** Gross margin left after ingredient cost. */
export function marginPercent(cost: number, price: number) {
  if (price <= 0) return 0;
  return Math.round(((price - cost) / price) * 1000) / 10;
}

// ─────────────────────────────── row shapes ───────────────────────────────

export interface SalesBucket {
  bucket: string;
  orders: number;
  gross: number;
  discounts: number;
  tax: number;
  serviceCharge: number;
  net: number;
  avgOrder: number;
}

export interface SalesReport {
  buckets: SalesBucket[];
  totals: Omit<SalesBucket, "bucket">;
  byType: { type: string; orders: number; revenue: number; share: number }[];
  byMethod: { method: string; payments: number; amount: number; share: number }[];
}

export interface ProductRow {
  menuItemId: string;
  name: string;
  category: string;
  quantity: number;
  revenue: number;
  share: number;
}

export interface InventoryRow {
  inventoryItemId: string;
  name: string;
  sku: string;
  unit: string;
  category: string;
  onHand: number;
  value: number;
  reorderLevel: number;
  belowReorder: boolean;
  wasteQty: number;
}

export interface InventoryReport {
  rows: InventoryRow[];
  totalValue: number;
  lowStockCount: number;
  wasteValue: number;
}

export interface FoodCostRow {
  menuItemId: string;
  name: string;
  price: number;
  foodCost: number;
  costPercent: number;
  margin: number;
  soldQty: number;
  totalCost: number;
  totalRevenue: number;
}

export interface FoodCostReport {
  rows: FoodCostRow[];
  overallCostPercent: number;
}

export interface TaxBucket {
  bucket: string;
  taxableSales: number;
  taxCollected: number;
  expenseTax: number;
  netTax: number;
}

export interface TaxReport {
  buckets: TaxBucket[];
  totals: Omit<TaxBucket, "bucket">;
}

export interface PayrollReportRow {
  period: string;
  payrollStatus: string;
  employees: number;
  gross: number;
  overtime: number;
  bonuses: number;
  deductions: number;
  taxWithheld: number;
  net: number;
}

export interface CustomerRow {
  customerId: string;
  name: string;
  phone: string;
  orders: number;
  spend: number;
  avgOrder: number;
  loyaltyPoints: number;
  loyaltyTier: string;
  lastOrderAt: string | null;
}

export interface CustomerReport {
  rows: CustomerRow[];
  newCustomers: number;
  returningShare: number;
}

// ─────────────────────────────── queries ───────────────────────────────

function orderScope(ctx: TenantContext, q: ReportQuery) {
  const branchId = q.branchId || ctx.branchId;
  return {
    ...tenantWhere(ctx),
    ...(branchId ? { branchId } : {}),
    orderStatus: { in: [...REVENUE_STATUSES] },
    createdAt: { gte: parseDate(q.from), lt: endOfDay(q.to) },
  };
}

async function sales(ctx: TenantContext, q: ReportQuery): Promise<SalesReport> {
  const where = orderScope(ctx, q);
  const [orders, payments] = await Promise.all([
    prisma.order.findMany({
      where,
      select: {
        type: true,
        createdAt: true,
        totalAmount: true,
        discountAmount: true,
        taxAmount: true,
        serviceCharge: true,
      },
    }),
    prisma.payment.groupBy({
      by: ["method"],
      where: {
        organizationId: ctx.organizationId,
        ...(q.branchId || ctx.branchId ? { branchId: q.branchId || ctx.branchId! } : {}),
        paymentStatus: "CAPTURED",
        createdAt: { gte: parseDate(q.from), lt: endOfDay(q.to) },
      },
      _count: true,
      _sum: { amount: true },
    }),
  ]);

  const empty = () => ({
    orders: 0,
    gross: 0,
    discounts: 0,
    tax: 0,
    serviceCharge: 0,
    net: 0,
    avgOrder: 0,
  });

  const byBucket = new Map<string, ReturnType<typeof empty>>();
  for (const key of bucketRange(q.from, q.to, q.granularity)) byBucket.set(key, empty());

  const byType = new Map<string, { orders: number; revenue: number }>();
  const totals = empty();

  for (const order of orders) {
    const key = bucketKey(order.createdAt, q.granularity);
    const bucket = byBucket.get(key) ?? empty();
    byBucket.set(key, bucket);

    const total = Number(order.totalAmount);
    const discount = Number(order.discountAmount);
    const tax = Number(order.taxAmount);
    const service = Number(order.serviceCharge);
    for (const agg of [bucket, totals]) {
      agg.orders += 1;
      agg.gross = round2(agg.gross + total);
      agg.discounts = round2(agg.discounts + discount);
      agg.tax = round2(agg.tax + tax);
      agg.serviceCharge = round2(agg.serviceCharge + service);
      agg.net = round2(agg.net + total - tax);
    }

    const t = byType.get(order.type) ?? { orders: 0, revenue: 0 };
    t.orders += 1;
    t.revenue = round2(t.revenue + total);
    byType.set(order.type, t);
  }

  const finish = (agg: ReturnType<typeof empty>) => ({
    ...agg,
    avgOrder: agg.orders > 0 ? round2(agg.gross / agg.orders) : 0,
  });

  const paymentTotal = payments.reduce((sum, p) => sum + Number(p._sum.amount ?? 0), 0);

  return {
    buckets: [...byBucket.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, agg]) => ({ bucket, ...finish(agg) })),
    totals: finish(totals),
    byType: [...byType.entries()]
      .sort(([, a], [, b]) => b.revenue - a.revenue)
      .map(([type, t]) => ({ type, ...t, share: percentOf(t.revenue, totals.gross) })),
    byMethod: payments
      .map((p) => ({
        method: p.method,
        payments: p._count,
        amount: round2(Number(p._sum.amount ?? 0)),
        share: percentOf(Number(p._sum.amount ?? 0), paymentTotal),
      }))
      .sort((a, b) => b.amount - a.amount),
  };
}

async function products(ctx: TenantContext, q: ReportQuery): Promise<ProductRow[]> {
  const grouped = await prisma.orderItem.groupBy({
    by: ["menuItemId"],
    where: {
      voidedAt: null,
      order: { is: orderScope(ctx, q) },
    },
    _sum: { quantity: true, lineTotal: true },
  });

  const items = await prisma.menuItem.findMany({
    where: { id: { in: grouped.map((g) => g.menuItemId) } },
    select: { id: true, name: true, category: { select: { name: true } } },
  });
  const names = new Map(items.map((i) => [i.id, i]));
  const totalRevenue = grouped.reduce((sum, g) => sum + Number(g._sum.lineTotal ?? 0), 0);

  return grouped
    .map((g) => {
      const item = names.get(g.menuItemId);
      const revenue = round2(Number(g._sum.lineTotal ?? 0));
      return {
        menuItemId: g.menuItemId,
        name: item?.name ?? "(deleted item)",
        category: item?.category.name ?? "—",
        quantity: Number(g._sum.quantity ?? 0),
        revenue,
        share: percentOf(revenue, totalRevenue),
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, q.limit);
}

async function inventory(ctx: TenantContext, q: ReportQuery): Promise<InventoryReport> {
  const [items, waste] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { ...tenantWhere(ctx), status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        sku: true,
        unit: true,
        categoryName: true,
        reorderLevel: true,
        avgCost: true,
        stockLevels: { select: { quantity: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.stockMovement.groupBy({
      by: ["inventoryItemId"],
      where: {
        organizationId: ctx.organizationId,
        type: { in: ["WASTE", "SPOILAGE"] },
        createdAt: { gte: parseDate(q.from), lt: endOfDay(q.to) },
      },
      _sum: { quantity: true },
    }),
  ]);

  const wasteByItem = new Map(
    // Outbound movements are stored negative; report waste as a positive quantity.
    waste.map((w) => [w.inventoryItemId, Math.abs(Number(w._sum.quantity ?? 0))]),
  );

  let totalValue = 0;
  let wasteValue = 0;
  const rows = items.map((item) => {
    const onHand = item.stockLevels.reduce((sum, s) => sum + Number(s.quantity), 0);
    const value = round2(onHand * Number(item.avgCost));
    const wasteQty = wasteByItem.get(item.id) ?? 0;
    totalValue = round2(totalValue + value);
    wasteValue = round2(wasteValue + wasteQty * Number(item.avgCost));
    return {
      inventoryItemId: item.id,
      name: item.name,
      sku: item.sku,
      unit: item.unit,
      category: item.categoryName ?? "—",
      onHand,
      value,
      reorderLevel: Number(item.reorderLevel),
      belowReorder: Number(item.reorderLevel) > 0 && onHand <= Number(item.reorderLevel),
      wasteQty,
    };
  });

  return {
    rows,
    totalValue,
    lowStockCount: rows.filter((r) => r.belowReorder).length,
    wasteValue,
  };
}

async function foodCost(ctx: TenantContext, q: ReportQuery): Promise<FoodCostReport> {
  const [recipes, sold] = await Promise.all([
    prisma.recipe.findMany({
      where: { ...tenantWhere(ctx), isActive: true },
      select: {
        menuItemId: true,
        foodCost: true,
        menuItem: { select: { name: true, basePrice: true } },
      },
    }),
    prisma.orderItem.groupBy({
      by: ["menuItemId"],
      where: { voidedAt: null, order: { is: orderScope(ctx, q) } },
      _sum: { quantity: true, lineTotal: true },
    }),
  ]);

  const soldByItem = new Map(sold.map((s) => [s.menuItemId, s._sum]));

  let periodCost = 0;
  let periodRevenue = 0;
  const rows = recipes
    .map((recipe) => {
      const price = Number(recipe.menuItem.basePrice);
      const cost = Number(recipe.foodCost);
      const sums = soldByItem.get(recipe.menuItemId);
      const soldQty = Number(sums?.quantity ?? 0);
      const totalRevenue = round2(Number(sums?.lineTotal ?? 0));
      const totalCost = round2(cost * soldQty);
      periodCost = round2(periodCost + totalCost);
      periodRevenue = round2(periodRevenue + totalRevenue);
      return {
        menuItemId: recipe.menuItemId,
        name: recipe.menuItem.name,
        price,
        foodCost: cost,
        costPercent: foodCostPercent(cost, price),
        margin: marginPercent(cost, price),
        soldQty,
        totalCost,
        totalRevenue,
      };
    })
    .sort((a, b) => b.costPercent - a.costPercent)
    .slice(0, q.limit);

  return { rows, overallCostPercent: percentOf(periodCost, periodRevenue) };
}

async function tax(ctx: TenantContext, q: ReportQuery): Promise<TaxReport> {
  const [orders, expenses] = await Promise.all([
    prisma.order.findMany({
      where: orderScope(ctx, q),
      select: { createdAt: true, totalAmount: true, taxAmount: true },
    }),
    prisma.expense.findMany({
      where: {
        ...tenantWhere(ctx),
        expenseDate: { gte: parseDate(q.from), lt: endOfDay(q.to) },
      },
      select: { expenseDate: true, taxAmount: true },
    }),
  ]);

  const empty = () => ({ taxableSales: 0, taxCollected: 0, expenseTax: 0, netTax: 0 });
  const byBucket = new Map<string, ReturnType<typeof empty>>();
  for (const key of bucketRange(q.from, q.to, q.granularity)) byBucket.set(key, empty());
  const totals = empty();

  for (const order of orders) {
    const key = bucketKey(order.createdAt, q.granularity);
    const bucket = byBucket.get(key) ?? empty();
    byBucket.set(key, bucket);
    const taxAmt = Number(order.taxAmount);
    const sales = Number(order.totalAmount) - taxAmt;
    for (const agg of [bucket, totals]) {
      agg.taxableSales = round2(agg.taxableSales + sales);
      agg.taxCollected = round2(agg.taxCollected + taxAmt);
    }
  }

  for (const expense of expenses) {
    const key = bucketKey(expense.expenseDate, q.granularity);
    const bucket = byBucket.get(key) ?? empty();
    byBucket.set(key, bucket);
    const taxAmt = Number(expense.taxAmount);
    bucket.expenseTax = round2(bucket.expenseTax + taxAmt);
    totals.expenseTax = round2(totals.expenseTax + taxAmt);
  }

  // Net liability: tax collected on sales minus tax already paid on purchases.
  for (const agg of [...byBucket.values(), totals]) {
    agg.netTax = round2(agg.taxCollected - agg.expenseTax);
  }

  return {
    buckets: [...byBucket.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, agg]) => ({ bucket, ...agg })),
    totals,
  };
}

async function payroll(ctx: TenantContext, q: ReportQuery): Promise<PayrollReportRow[]> {
  const runs = await prisma.payrollRun.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(q.branchId || ctx.branchId ? { branchId: q.branchId || ctx.branchId } : {}),
      periodStart: { gte: parseDate(q.from) },
      periodEnd: { lt: endOfDay(q.to) },
    },
    select: {
      periodStart: true,
      periodEnd: true,
      payrollStatus: true,
      entries: {
        select: {
          baseSalary: true,
          overtimePay: true,
          bonuses: true,
          deductions: true,
          taxWithheld: true,
          netPay: true,
        },
      },
    },
    orderBy: { periodStart: "desc" },
  });

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return runs.map((run) => {
    const sum = (pick: (e: (typeof run.entries)[number]) => unknown) =>
      round2(run.entries.reduce((acc, e) => acc + Number(pick(e)), 0));
    return {
      period: `${iso(run.periodStart)} → ${iso(run.periodEnd)}`,
      payrollStatus: run.payrollStatus,
      employees: run.entries.length,
      gross: sum((e) => e.baseSalary) + sum((e) => e.overtimePay) + sum((e) => e.bonuses),
      overtime: sum((e) => e.overtimePay),
      bonuses: sum((e) => e.bonuses),
      deductions: sum((e) => e.deductions),
      taxWithheld: sum((e) => e.taxWithheld),
      net: sum((e) => e.netPay),
    };
  });
}

async function customers(ctx: TenantContext, q: ReportQuery): Promise<CustomerReport> {
  const [grouped, newCustomers] = await Promise.all([
    prisma.order.groupBy({
      by: ["customerId"],
      where: { ...orderScope(ctx, q), customerId: { not: null } },
      _count: true,
      _sum: { totalAmount: true },
      _max: { createdAt: true },
    }),
    prisma.customer.count({
      where: {
        ...tenantWhere(ctx),
        createdAt: { gte: parseDate(q.from), lt: endOfDay(q.to) },
      },
    }),
  ]);

  const ids = grouped.map((g) => g.customerId).filter((id): id is string => id !== null);
  const profiles = await prisma.customer.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      loyaltyPoints: true,
      loyaltyTier: true,
      visitCount: true,
    },
  });
  const byId = new Map(profiles.map((p) => [p.id, p]));

  const rows = grouped
    .filter((g) => g.customerId !== null)
    .map((g) => {
      const profile = byId.get(g.customerId!);
      const spend = round2(Number(g._sum.totalAmount ?? 0));
      return {
        customerId: g.customerId!,
        name: profile
          ? [profile.firstName, profile.lastName].filter(Boolean).join(" ")
          : "(deleted customer)",
        phone: profile?.phone ?? "—",
        orders: g._count,
        spend,
        avgOrder: g._count > 0 ? round2(spend / g._count) : 0,
        loyaltyPoints: profile?.loyaltyPoints ?? 0,
        loyaltyTier: profile?.loyaltyTier ?? "—",
        lastOrderAt: g._max.createdAt ? g._max.createdAt.toISOString().slice(0, 10) : null,
      };
    })
    .sort((a, b) => b.spend - a.spend)
    .slice(0, q.limit);

  const returning = rows.filter((r) => r.orders > 1).length;

  return {
    rows,
    newCustomers,
    returningShare: percentOf(returning, rows.length),
  };
}

export const reportsService = {
  sales,
  products,
  inventory,
  foodCost,
  tax,
  payroll,
  customers,
};
