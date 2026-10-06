import { z } from "zod";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

/** Every report the module can render or export. */
export const REPORT_KINDS = [
  "sales",
  "products",
  "inventory",
  "foodCost",
  "tax",
  "payroll",
  "customers",
] as const;

export const EXPORT_FORMATS = ["csv", "excel", "pdf"] as const;

/** How the sales report buckets its rows along the time axis. */
export const SALES_GRANULARITIES = ["day", "week", "month"] as const;

export const reportQuerySchema = z
  .object({
    from: dateOnly,
    to: dateOnly,
    granularity: z.enum(SALES_GRANULARITIES).default("day"),
    branchId: z.string().uuid().optional().or(z.literal("")),
    /** Cap on rows for the "top N" style reports. */
    limit: z.coerce.number().int().min(1).max(200).default(20),
  })
  // An inverted range would silently return nothing, which reads as "no sales".
  .refine((v) => v.to >= v.from, {
    message: "End date cannot be before the start date",
    path: ["to"],
  });

export const exportRequestSchema = z.object({
  kind: z.enum(REPORT_KINDS),
  format: z.enum(EXPORT_FORMATS),
  from: dateOnly,
  to: dateOnly,
  granularity: z.enum(SALES_GRANULARITIES).default("day"),
  branchId: z.string().uuid().optional().or(z.literal("")),
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
});

export type ReportKind = (typeof REPORT_KINDS)[number];
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export type SalesGranularity = (typeof SALES_GRANULARITIES)[number];
export type ReportQuery = z.output<typeof reportQuerySchema>;
export type ExportRequest = z.output<typeof exportRequestSchema>;
