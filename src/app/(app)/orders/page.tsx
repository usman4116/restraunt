import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { listOrderHistory } from "@/modules/orders/service/order.service";
import { OrderHistory } from "@/modules/orders/components/order-history";

export const metadata: Metadata = { title: "Order History" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function iso(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function defaultRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: iso(from), to: iso(to) };
}

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export default async function OrdersPage({ searchParams }: Props) {
  const ctx = await requirePermission("orders:view");
  const params = await searchParams;
  const fallback = defaultRange();

  const from   = str(params.from)   ?? fallback.from;
  const to     = str(params.to)     ?? fallback.to;
  const status = str(params.status) ?? "ALL";
  const type   = str(params.type)   ?? "ALL";
  const search = str(params.search) ?? "";
  const page   = Math.max(1, Number(str(params.page) ?? "1"));

  const result = await listOrderHistory(ctx, {
    from,
    to,
    status: status === "ALL" ? undefined : status,
    type:   type   === "ALL" ? undefined : type,
    search: search || undefined,
    page,
  });

  return (
    <OrderHistory
      orders={result.orders}
      total={result.total}
      page={result.page}
      pageSize={result.pageSize}
      pageCount={result.pageCount}
      from={from}
      to={to}
      status={status}
      type={type}
      search={search}
    />
  );
}
