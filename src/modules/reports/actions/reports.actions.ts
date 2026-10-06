"use server";

import { guard, err, type Result } from "@/lib/result";
import { requirePermission } from "@/lib/auth/context";
import { exportRequestSchema, type ExportRequest } from "../dto/reports.dto";
import { reportsService } from "../service/reports.service";
import { serializeExport, type ExportFile, type ExportTable } from "../lib/export";

function zodFields(e: import("zod").ZodError): Record<string, string> {
  return Object.fromEntries(e.issues.map((i) => [i.path.join("."), i.message]));
}

type Ctx = Awaited<ReturnType<typeof requirePermission>>;

/** Build the flat table each report kind exports. Kept beside the action so the
 *  on-screen report and the downloaded file can never drift apart silently. */
async function buildTable(ctx: Ctx, req: ExportRequest): Promise<ExportTable<Record<string, unknown>>> {
  const query = {
    from: req.from,
    to: req.to,
    granularity: req.granularity,
    branchId: req.branchId,
    limit: req.limit,
  };
  const subtitle = `${req.from} to ${req.to}`;

  switch (req.kind) {
    case "sales": {
      const report = await reportsService.sales(ctx, query);
      return {
        title: "Sales report",
        subtitle,
        columns: [
          { key: "bucket", label: "Period" },
          { key: "orders", label: "Orders", numeric: true },
          { key: "gross", label: "Gross", numeric: true },
          { key: "discounts", label: "Discounts", numeric: true },
          { key: "tax", label: "Tax", numeric: true },
          { key: "serviceCharge", label: "Service", numeric: true },
          { key: "net", label: "Net", numeric: true },
          { key: "avgOrder", label: "Avg order", numeric: true },
        ],
        rows: report.buckets as unknown as Record<string, unknown>[],
      };
    }
    case "products": {
      const rows = await reportsService.products(ctx, query);
      return {
        title: "Product performance",
        subtitle,
        columns: [
          { key: "name", label: "Item" },
          { key: "category", label: "Category" },
          { key: "quantity", label: "Qty sold", numeric: true },
          { key: "revenue", label: "Revenue", numeric: true },
          { key: "share", label: "Share %", numeric: true },
        ],
        rows: rows as unknown as Record<string, unknown>[],
      };
    }
    case "inventory": {
      const report = await reportsService.inventory(ctx, query);
      return {
        title: "Inventory valuation",
        subtitle,
        columns: [
          { key: "sku", label: "SKU" },
          { key: "name", label: "Item" },
          { key: "category", label: "Category" },
          { key: "onHand", label: "On hand", numeric: true },
          { key: "unit", label: "Unit" },
          { key: "value", label: "Value", numeric: true },
          { key: "reorderLevel", label: "Reorder at", numeric: true },
          { key: "wasteQty", label: "Waste (period)", numeric: true },
        ],
        rows: report.rows as unknown as Record<string, unknown>[],
      };
    }
    case "foodCost": {
      const report = await reportsService.foodCost(ctx, query);
      return {
        title: "Food cost",
        subtitle,
        columns: [
          { key: "name", label: "Item" },
          { key: "price", label: "Price", numeric: true },
          { key: "foodCost", label: "Cost", numeric: true },
          { key: "costPercent", label: "Cost %", numeric: true },
          { key: "margin", label: "Margin %", numeric: true },
          { key: "soldQty", label: "Sold", numeric: true },
          { key: "totalCost", label: "Total cost", numeric: true },
          { key: "totalRevenue", label: "Total revenue", numeric: true },
        ],
        rows: report.rows as unknown as Record<string, unknown>[],
      };
    }
    case "tax": {
      const report = await reportsService.tax(ctx, query);
      return {
        title: "Tax report",
        subtitle,
        columns: [
          { key: "bucket", label: "Period" },
          { key: "taxableSales", label: "Taxable sales", numeric: true },
          { key: "taxCollected", label: "Tax collected", numeric: true },
          { key: "expenseTax", label: "Tax paid", numeric: true },
          { key: "netTax", label: "Net liability", numeric: true },
        ],
        rows: report.buckets as unknown as Record<string, unknown>[],
      };
    }
    case "payroll": {
      const rows = await reportsService.payroll(ctx, query);
      return {
        title: "Payroll report",
        subtitle,
        columns: [
          { key: "period", label: "Period" },
          { key: "payrollStatus", label: "Status" },
          { key: "employees", label: "Employees", numeric: true },
          { key: "gross", label: "Gross", numeric: true },
          { key: "overtime", label: "Overtime", numeric: true },
          { key: "bonuses", label: "Bonuses", numeric: true },
          { key: "deductions", label: "Deductions", numeric: true },
          { key: "taxWithheld", label: "Tax withheld", numeric: true },
          { key: "net", label: "Net", numeric: true },
        ],
        rows: rows as unknown as Record<string, unknown>[],
      };
    }
    case "customers": {
      const report = await reportsService.customers(ctx, query);
      return {
        title: "Customer analytics",
        subtitle,
        columns: [
          { key: "name", label: "Customer" },
          { key: "phone", label: "Phone" },
          { key: "orders", label: "Orders", numeric: true },
          { key: "spend", label: "Spend", numeric: true },
          { key: "avgOrder", label: "Avg order", numeric: true },
          { key: "loyaltyTier", label: "Tier" },
          { key: "loyaltyPoints", label: "Points", numeric: true },
          { key: "lastOrderAt", label: "Last order" },
        ],
        rows: report.rows as unknown as Record<string, unknown>[],
      };
    }
  }
}

export async function exportReportAction(raw: unknown): Promise<Result<ExportFile>> {
  const parsed = exportRequestSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid input.", zodFields(parsed.error));
  return guard(async () => {
    const ctx = await requirePermission("reports:export");
    const table = await buildTable(ctx, parsed.data);
    return serializeExport(table, parsed.data.format, `${parsed.data.from}_${parsed.data.to}`);
  });
}
