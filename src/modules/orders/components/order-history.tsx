"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface OrderPayment {
  method: string;
  amount: number;
  status: string;
}

export interface OrderHistoryRow {
  id: string;
  orderNumber: string;
  type: string;
  orderStatus: string;
  tableName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  tipAmount: number;
  totalAmount: number;
  paidAmount: number;
  placedAt: Date | string | null;
  completedAt: Date | string | null;
  cancelledAt: Date | string | null;
  cancelReason: string | null;
  createdAt: Date | string;
  items: OrderItem[];
  payments: OrderPayment[];
}

interface Props {
  orders: OrderHistoryRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  from: string;
  to: string;
  status: string;
  type: string;
  search: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ORDER_STATUSES = [
  "ALL",
  "DRAFT",
  "PLACED",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "SERVED",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
] as const;

const ORDER_TYPES = ["ALL", "DINE_IN", "TAKEAWAY", "DELIVERY", "QR_ORDER"] as const;

const STATUS_STYLES: Record<string, string> = {
  DRAFT:            "bg-muted text-muted-foreground",
  PLACED:           "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  CONFIRMED:        "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  PREPARING:        "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  READY:            "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  SERVED:           "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  OUT_FOR_DELIVERY: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  COMPLETED:        "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  CANCELLED:        "bg-destructive/15 text-destructive",
  REFUNDED:         "bg-muted text-muted-foreground",
};

const TYPE_LABELS: Record<string, string> = {
  DINE_IN:   "Dine-in",
  TAKEAWAY:  "Takeaway",
  DELIVERY:  "Delivery",
  QR_ORDER:  "QR order",
};

const METHOD_LABELS: Record<string, string> = {
  CASH:          "Cash",
  CARD:          "Card",
  MOBILE_WALLET: "Mobile wallet",
  GIFT_CARD:     "Gift card",
  BANK_TRANSFER: "Bank transfer",
  ONLINE:        "Online",
};

const money = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });
const dateTimeFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// ─── Component ────────────────────────────────────────────────────────────────

export function OrderHistory({
  orders,
  total,
  page,
  pageCount,
  from,
  to,
  status,
  type,
  search,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(search);

  const setParam = (updates: Record<string, string | null>) => {
    startTransition(() => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "" || v === "ALL") next.delete(k);
        else next.set(k, v);
      }
      // Reset to page 1 on any filter change
      if (!("page" in updates)) next.delete("page");
      router.push(`${pathname}?${next.toString()}`);
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setParam({ search: searchInput });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Order History</h1>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()} order{total !== 1 ? "s" : ""} found
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-40"
            value={from}
            onChange={(e) => setParam({ from: e.target.value })}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            className="w-40"
            value={to}
            onChange={(e) => setParam({ to: e.target.value })}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Order # or customer…"
            className="w-56 pl-8"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </form>

        <Select
          value={status}
          onValueChange={(v) => setParam({ status: v })}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            {ORDER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "ALL" ? "All statuses" : s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={type}
          onValueChange={(v) => setParam({ type: v })}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            {ORDER_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t === "ALL" ? "All types" : TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {pending && <RefreshCw className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Order #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Table / Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Paid</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  No orders found for this period.
                </TableCell>
              </TableRow>
            )}
            {orders.map((order) => (
              <Fragment key={order.id}>
                {/* Summary row */}
                <TableRow
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                >
                  <TableCell>
                    <Receipt
                      className={cn(
                        "size-4 text-muted-foreground transition-transform",
                        expanded === order.id && "text-primary",
                      )}
                    />
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">
                    {order.orderNumber}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {dateTimeFormat.format(new Date(order.createdAt))}
                  </TableCell>
                  <TableCell className="text-sm">
                    {TYPE_LABELS[order.type] ?? order.type}
                  </TableCell>
                  <TableCell className="text-sm">
                    {order.tableName && (
                      <span className="font-medium">Table {order.tableName}</span>
                    )}
                    {order.customerName && (
                      <span className={cn("block text-xs text-muted-foreground", order.tableName && "")}>
                        {order.customerName}
                      </span>
                    )}
                    {!order.tableName && !order.customerName && (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        STATUS_STYLES[order.orderStatus] ?? "bg-muted",
                      )}
                    >
                      {order.orderStatus.charAt(0) + order.orderStatus.slice(1).toLowerCase().replace(/_/g, " ")}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money.format(order.totalAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={cn(order.paidAmount < order.totalAmount && "text-amber-600 dark:text-amber-400")}>
                      {money.format(order.paidAmount)}
                    </span>
                  </TableCell>
                </TableRow>

                {/* Expanded detail row */}
                {expanded === order.id && (
                  <TableRow>
                    <TableCell colSpan={8} className="bg-muted/30 p-0">
                      <div className="grid gap-4 p-4 sm:grid-cols-2">
                        {/* Items */}
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Items
                          </p>
                          <div className="space-y-1">
                            {order.items.map((item) => (
                              <div key={item.id} className="flex justify-between text-sm">
                                <span>
                                  <span className="tabular-nums text-muted-foreground">
                                    {Number(item.quantity)}×
                                  </span>{" "}
                                  {item.name}
                                </span>
                                <span className="tabular-nums">
                                  {money.format(item.lineTotal)}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 space-y-0.5 border-t pt-2 text-xs text-muted-foreground">
                            {order.discountAmount > 0 && (
                              <div className="flex justify-between">
                                <span>Discount</span>
                                <span className="tabular-nums text-destructive">
                                  −{money.format(order.discountAmount)}
                                </span>
                              </div>
                            )}
                            {order.taxAmount > 0 && (
                              <div className="flex justify-between">
                                <span>Tax</span>
                                <span className="tabular-nums">{money.format(order.taxAmount)}</span>
                              </div>
                            )}
                            {order.tipAmount > 0 && (
                              <div className="flex justify-between">
                                <span>Tip</span>
                                <span className="tabular-nums">{money.format(order.tipAmount)}</span>
                              </div>
                            )}
                            <div className="flex justify-between font-medium text-foreground">
                              <span>Total</span>
                              <span className="tabular-nums">{money.format(order.totalAmount)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Meta */}
                        <div className="space-y-3">
                          {order.payments.length > 0 && (
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Payments
                              </p>
                              <div className="space-y-1">
                                {order.payments.map((p, i) => (
                                  <div key={i} className="flex justify-between text-sm">
                                    <span>{METHOD_LABELS[p.method] ?? p.method}</span>
                                    <span className="tabular-nums">{money.format(p.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Timeline
                            </p>
                            <div className="space-y-1 text-xs text-muted-foreground">
                              <div className="flex justify-between">
                                <span>Created</span>
                                <span>{dateTimeFormat.format(new Date(order.createdAt))}</span>
                              </div>
                              {order.placedAt && (
                                <div className="flex justify-between">
                                  <span>Placed</span>
                                  <span>{dateTimeFormat.format(new Date(order.placedAt))}</span>
                                </div>
                              )}
                              {order.completedAt && (
                                <div className="flex justify-between">
                                  <span>Completed</span>
                                  <span>{dateTimeFormat.format(new Date(order.completedAt))}</span>
                                </div>
                              )}
                              {order.cancelledAt && (
                                <div className="flex justify-between">
                                  <span>Cancelled</span>
                                  <span>{dateTimeFormat.format(new Date(order.cancelledAt))}</span>
                                </div>
                              )}
                              {order.cancelReason && (
                                <div className="flex justify-between">
                                  <span>Reason</span>
                                  <span className="max-w-40 truncate text-right">{order.cancelReason}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {order.customerPhone && (
                            <div className="text-xs text-muted-foreground">
                              <span className="font-medium">Phone: </span>
                              {order.customerPhone}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {pageCount}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              disabled={page <= 1}
              onClick={() => setParam({ page: String(page - 1) })}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={page >= pageCount}
              onClick={() => setParam({ page: String(page + 1) })}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
