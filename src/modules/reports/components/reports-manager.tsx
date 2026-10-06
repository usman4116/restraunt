"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  AlertTriangle,
  Receipt,
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Boxes,
  Trash2,
  Landmark,
  Users,
  UserPlus,
  Repeat,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type {
  SalesReport,
  ProductRow,
  InventoryReport,
  FoodCostReport,
  TaxReport,
  PayrollReportRow,
  CustomerReport,
} from "../service/reports.service";
import type { ReportKind, SalesGranularity } from "../dto/reports.dto";
import { ExportMenu } from "./export-menu";
import { ReportCharts } from "./report-charts";

interface Props {
  sales: SalesReport;
  products: ProductRow[];
  inventory: InventoryReport;
  foodCost: FoodCostReport;
  tax: TaxReport;
  payroll: PayrollReportRow[];
  customers: CustomerReport;
  from: string;
  to: string;
  granularity: SalesGranularity;
}

const money = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });
const qty = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });

const GRANULARITIES: { value: SalesGranularity; label: string }[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

const TABS: { value: ReportKind; label: string }[] = [
  { value: "sales", label: "Sales" },
  { value: "products", label: "Products" },
  { value: "inventory", label: "Inventory" },
  { value: "foodCost", label: "Food cost" },
  { value: "tax", label: "Tax" },
  { value: "payroll", label: "Payroll" },
  { value: "customers", label: "Customers" },
];

export function ReportsManager({
  sales,
  products,
  inventory,
  foodCost,
  tax,
  payroll,
  customers,
  from,
  to,
  granularity,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(search.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  };

  const tab = (search.get("tab") as ReportKind) ?? "sales";
  const exportProps = { from, to, granularity };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Sales, products, inventory, food cost, tax, payroll and customer analytics
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="r-from" className="text-xs">
              From
            </Label>
            <Input
              id="r-from"
              type="date"
              className="w-36"
              value={from}
              onChange={(e) => setParam("from", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="r-to" className="text-xs">
              To
            </Label>
            <Input
              id="r-to"
              type="date"
              className="w-36"
              value={to}
              onChange={(e) => setParam("to", e.target.value)}
            />
          </div>
          <Select
            value={granularity}
            onValueChange={(value) => setParam("granularity", value ?? "day")}
          >
            <SelectTrigger className="w-28" aria-label="Granularity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GRANULARITIES.map((g) => (
                <SelectItem key={g.value} value={g.value}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setParam("tab", value)}>
        <TabsList className="flex-wrap">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="sales" className="space-y-4">
          <div className="flex items-center justify-end">
            <ExportMenu kind="sales" {...exportProps} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Orders" value={String(sales.totals.orders)} icon={ShoppingCart} />
            <StatTile label="Gross sales" value={money.format(sales.totals.gross)} icon={DollarSign} />
            <StatTile label="Net revenue" value={money.format(sales.totals.net)} icon={TrendingUp} />
            <StatTile label="Avg order" value={money.format(sales.totals.avgOrder)} icon={Receipt} />
          </div>
          <ReportCharts
            data={sales.buckets.map((b) => ({ bucket: b.bucket, net: b.net, orders: b.orders }))}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order type</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.byType.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No orders in this period.
                      </TableCell>
                    </TableRow>
                  )}
                  {sales.byType.map((row) => (
                    <TableRow key={row.type}>
                      <TableCell>{row.type.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.orders}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money.format(row.revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.share}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment method</TableHead>
                    <TableHead className="text-right">Payments</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.byMethod.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No captured payments in this period.
                      </TableCell>
                    </TableRow>
                  )}
                  {sales.byMethod.map((row) => (
                    <TableRow key={row.method}>
                      <TableCell>{row.method.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.payments}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money.format(row.amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.share}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <div className="flex items-center justify-end">
            <ExportMenu kind="products" {...exportProps} />
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Qty sold</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Nothing sold in this period.
                    </TableCell>
                  </TableRow>
                )}
                {products.map((row) => (
                  <TableRow key={row.menuItemId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.category}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {qty.format(row.quantity)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(row.revenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.share}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4">
          <div className="flex items-center justify-end">
            <ExportMenu kind="inventory" {...exportProps} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label="Stock value" value={money.format(inventory.totalValue)} icon={Boxes} />
            <StatTile
              label="Below reorder"
              value={String(inventory.lowStockCount)}
              icon={AlertTriangle}
              tone={inventory.lowStockCount > 0 ? "warning" : "default"}
            />
            <StatTile
              label="Waste value (period)"
              value={money.format(inventory.wasteValue)}
              icon={Trash2}
            />
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Waste</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No inventory items yet.
                    </TableCell>
                  </TableRow>
                )}
                {inventory.rows.map((row) => (
                  <TableRow key={row.inventoryItemId}>
                    <TableCell className="tabular-nums text-muted-foreground">{row.sku}</TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.category}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {qty.format(row.onHand)} {row.unit}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(row.value)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.wasteQty > 0 ? `${qty.format(row.wasteQty)} ${row.unit}` : "—"}
                    </TableCell>
                    <TableCell>
                      {row.belowReorder && (
                        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-500">
                          <AlertTriangle className="size-3" /> Reorder
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="foodCost" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Overall food cost this period:{" "}
              <strong
                className={cn(
                  "tabular-nums",
                  foodCost.overallCostPercent > 35 ? "text-amber-600" : "text-foreground",
                )}
              >
                {foodCost.overallCostPercent}%
              </strong>
            </p>
            <ExportMenu kind="foodCost" {...exportProps} />
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Cost %</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Period revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {foodCost.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No active recipes yet — food cost needs a recipe per menu item.
                    </TableCell>
                  </TableRow>
                )}
                {foodCost.rows.map((row) => (
                  <TableRow key={row.menuItemId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(row.price)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(row.foodCost)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        row.costPercent > 35 && "font-medium text-amber-600",
                      )}
                    >
                      {row.costPercent}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.margin}%</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {qty.format(row.soldQty)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(row.totalRevenue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="tax" className="space-y-4">
          <div className="flex items-center justify-end">
            <ExportMenu kind="tax" {...exportProps} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              label="Tax collected"
              value={money.format(tax.totals.taxCollected)}
              icon={Landmark}
            />
            <StatTile
              label="Tax paid on expenses"
              value={money.format(tax.totals.expenseTax)}
              icon={Receipt}
            />
            <StatTile label="Net liability" value={money.format(tax.totals.netTax)} icon={DollarSign} />
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Taxable sales</TableHead>
                  <TableHead className="text-right">Tax collected</TableHead>
                  <TableHead className="text-right">Tax paid</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tax.buckets.map((row) => (
                  <TableRow key={row.bucket}>
                    <TableCell className="tabular-nums">{row.bucket}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(row.taxableSales)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(row.taxCollected)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(row.expenseTax)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(row.netTax)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="payroll" className="space-y-4">
          <div className="flex items-center justify-end">
            <ExportMenu kind="payroll" {...exportProps} />
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Overtime</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Tax withheld</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payroll.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No payroll runs in this period.
                    </TableCell>
                  </TableRow>
                )}
                {payroll.map((row) => (
                  <TableRow key={row.period}>
                    <TableCell className="tabular-nums">{row.period}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{row.payrollStatus.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.employees}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(row.gross)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(row.overtime)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(row.deductions)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(row.taxWithheld)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(row.net)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="customers" className="space-y-4">
          <div className="flex items-center justify-end">
            <ExportMenu kind="customers" {...exportProps} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label="Customers ordering" value={String(customers.rows.length)} icon={Users} />
            <StatTile label="New customers" value={String(customers.newCustomers)} icon={UserPlus} />
            <StatTile label="Returning share" value={`${customers.returningShare}%`} icon={Repeat} />
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Avg order</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Last order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No customer-linked orders in this period.
                    </TableCell>
                  </TableRow>
                )}
                {customers.rows.map((row) => (
                  <TableRow key={row.customerId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.phone}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.orders}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(row.spend)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(row.avgOrder)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{row.loyaltyTier}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.lastOrderAt ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
