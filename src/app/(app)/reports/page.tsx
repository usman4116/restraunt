import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { reportsService } from "@/modules/reports/service/reports.service";
import { reportQuerySchema } from "@/modules/reports/dto/reports.dto";
import { ReportsManager } from "@/modules/reports/components/reports-manager";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const iso = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Default window: the last 30 days, today inclusive. */
function defaultRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: iso(from), to: iso(to) };
}

export default async function ReportsPage({ searchParams }: Props) {
  const ctx = await requirePermission("reports:view");
  const params = await searchParams;
  const fallback = defaultRange();

  // A hand-edited URL (bad date, inverted range) falls back to the default window.
  const parsed = reportQuerySchema.safeParse({
    from: typeof params.from === "string" ? params.from : fallback.from,
    to: typeof params.to === "string" ? params.to : fallback.to,
    granularity: typeof params.granularity === "string" ? params.granularity : undefined,
  });
  const query = parsed.success ? parsed.data : reportQuerySchema.parse(fallback);

  const [sales, products, inventory, foodCost, tax, payroll, customers] = await Promise.all([
    reportsService.sales(ctx, query),
    reportsService.products(ctx, query),
    reportsService.inventory(ctx, query),
    reportsService.foodCost(ctx, query),
    reportsService.tax(ctx, query),
    reportsService.payroll(ctx, query),
    reportsService.customers(ctx, query),
  ]);

  return (
    <ReportsManager
      sales={sales}
      products={products}
      inventory={inventory}
      foodCost={foodCost}
      tax={tax}
      payroll={payroll}
      customers={customers}
      from={query.from}
      to={query.to}
      granularity={query.granularity}
    />
  );
}
