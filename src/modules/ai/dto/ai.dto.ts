import { z } from "zod";

// ─── Forecast ─────────────────────────────────────────────────────────────────

export interface ForecastPoint {
  /** ISO date string "YYYY-MM-DD". */
  date: string;
  /** Predicted revenue / order count. */
  predicted: number;
  /** Lower bound of 90 % confidence band. */
  lower: number;
  /** Upper bound of 90 % confidence band. */
  upper: number;
}

export interface SalesForecastResult {
  /** One point per forecast day. */
  points: ForecastPoint[];
  /** Human-readable method label, e.g. "Weighted 8-week moving average + linear trend". */
  method: string;
  /**
   * Mean absolute percentage error on the hold-out period (last 7 days), if
   * enough history existed. Absent when less than 14 days of history available.
   */
  mape?: number;
  /** Total predicted revenue for the horizon. */
  totalPredicted: number;
}

// ─── Inventory predictions ────────────────────────────────────────────────────

export interface InventoryPrediction {
  inventoryItemId: string;
  name: string;
  sku: string;
  unit: string;
  currentStock: number;
  /** Average units consumed per day over the measurement window. */
  avgDailyUse: number;
  /** Estimated days of stock remaining; Infinity when avgDailyUse is 0. */
  daysUntilStockout: number;
  /** True when reorder is advisable (≤ reorderLevel or ≤ 3 days stock). */
  reorderSuggested: boolean;
  reorderLevel: number;
}

export interface InventoryPredictionResult {
  predictions: InventoryPrediction[];
  criticalCount: number; // ≤ 1 day
  warningCount: number;  // 2–7 days
}

// ─── Daily digest ─────────────────────────────────────────────────────────────

export interface InsightCard {
  title: string;
  /** Formatted display value, e.g. "$12,450" or "142 orders". */
  value: string;
  /** Raw numeric value for sort/compare. */
  raw: number;
  /** Change vs the comparison period (+ve = better, -ve = worse). */
  delta?: number;
  /** Human label for the comparison, e.g. "vs same day last week". */
  deltaLabel?: string;
  trend?: "up" | "down" | "flat";
  severity?: "info" | "warning" | "critical";
}

export interface DigestAlert {
  type: "low_stock" | "no_sales" | "high_void" | "late_payroll" | "overdue_invoice";
  message: string;
  severity: "info" | "warning" | "critical";
}

export interface TopProductRow {
  name: string;
  category: string;
  qty: number;
  revenue: number;
}

export interface DailyDigest {
  /** ISO date string for the digest day (yesterday). */
  date: string;
  insights: InsightCard[];
  topProducts: TopProductRow[];
  alerts: DigestAlert[];
}

// ─── Natural-language query ───────────────────────────────────────────────────

export interface NlQueryResult {
  /** Human-readable interpretation of the query. */
  interpreted: string;
  /** ISO date string. */
  from: string;
  to: string;
  /** Maps to the report tab: "sales" | "products" | "inventory" | "foodCost" | "tax" | "payroll" | "customers". */
  metric: string;
  granularity?: "day" | "week" | "month";
  filters?: Record<string, string>;
  /** When true, the query could not be mapped to a known report. */
  unrecognised?: boolean;
}

// ─── Server-action input schemas ─────────────────────────────────────────────

export const forecastQuerySchema = z.object({
  horizonDays: z.coerce.number().int().min(1).max(90).default(7),
  branchId: z.string().uuid().optional(),
});
export type ForecastQuery = z.infer<typeof forecastQuerySchema>;

export const nlQuerySchema = z.object({
  q: z.string().min(2).max(400),
});
export type NlQueryInput = z.infer<typeof nlQuerySchema>;
