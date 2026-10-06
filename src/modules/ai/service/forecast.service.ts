import type { ForecastPoint, NlQueryResult } from "../dto/ai.dto";

// ──────────────────────────────── Pure helpers ────────────────────────────────

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

const pad = (n: number) => String(n).padStart(2, "0");
function isoDate(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Weighted moving average — recent values weighted more heavily.
 * Weights: [1, 2, 3, ..., N] for N values; oldest value gets weight 1, newest gets N.
 */
export function weightedMovingAverage(values: number[]): number {
  if (values.length === 0) return 0;
  const weights = values.map((_, i) => i + 1);
  const sumWeighted = values.reduce((sum, val, i) => sum + val * weights[i], 0);
  const sumWeights = weights.reduce((sum, w) => sum + w, 0);
  return sumWeighted / sumWeights;
}

/** Simple linear regression: y = slope * x + intercept. */
export function linearTrend(points: { x: number; y: number }[]): { slope: number; intercept: number } {
  const n = points.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  if (n === 1) return { slope: 0, intercept: points[0].y };

  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumX2 = points.reduce((sum, p) => sum + p.x * p.x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

/**
 * 90% confidence band around the mean (z = 1.645 for one-tailed 90%).
 * Standard deviation is computed from the residuals (actual - predicted).
 */
export function confidenceBand(
  mean: number,
  residuals: number[],
  z = 1.645
): { lower: number; upper: number } {
  if (residuals.length === 0) return { lower: mean, upper: mean };
  const variance = residuals.reduce((sum, r) => sum + r * r, 0) / residuals.length;
  const stdDev = Math.sqrt(variance);
  return {
    lower: Math.max(0, mean - z * stdDev), // revenue cannot be negative
    upper: mean + z * stdDev,
  };
}

/**
 * Mean absolute percentage error: mean(|actual - predicted| / actual).
 * Only includes data points where actual > 0.
 */
export function mape(actual: number[], predicted: number[]): number {
  if (actual.length !== predicted.length || actual.length === 0) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] > 0) {
      sum += Math.abs(actual[i] - predicted[i]) / actual[i];
      count++;
    }
  }
  return count > 0 ? round2((sum / count) * 100) : 0;
}

/**
 * Sales forecast using weighted moving average + linear trend adjustment.
 * Takes daily totals for the last N weeks, projects forward `horizonDays`.
 * Confidence bands from the residuals of the trend line.
 */
export function forecastSales(historicalDailyTotals: number[], horizonDays = 7): ForecastPoint[] {
  const points: ForecastPoint[] = [];
  const n = historicalDailyTotals.length;

  if (n === 0) {
    // No history — return zeros.
    const base = new Date();
    for (let i = 0; i < horizonDays; i++) {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() + i + 1);
      points.push({ date: isoDate(d), predicted: 0, lower: 0, upper: 0 });
    }
    return points;
  }

  // Fit a linear trend to the historical data: day index → revenue.
  const trendPoints = historicalDailyTotals.map((y, x) => ({ x, y }));
  const { slope, intercept } = linearTrend(trendPoints);

  // Compute residuals for confidence band.
  const residuals = historicalDailyTotals.map((actual, x) => actual - (slope * x + intercept));

  // Weighted moving average of the last 8 weeks (or all available data if less).
  const windowSize = Math.min(56, n);
  const recentWindow = historicalDailyTotals.slice(-windowSize);
  const baseline = weightedMovingAverage(recentWindow);

  // Project forward: baseline + trend adjustment.
  const base = new Date();
  for (let i = 0; i < horizonDays; i++) {
    const dayIndex = n + i;
    const trendAdjustment = slope * (dayIndex - (n - 1)); // relative to the last historical day
    const predicted = Math.max(0, round2(baseline + trendAdjustment));

    const band = confidenceBand(predicted, residuals);

    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i + 1);

    points.push({
      date: isoDate(d),
      predicted: round2(predicted),
      lower: round2(band.lower),
      upper: round2(band.upper),
    });
  }

  return points;
}

/**
 * Days of stock remaining = currentStock / avgDailyUse.
 * Returns Infinity when avgDailyUse is 0.
 */
export function daysUntilStockout(currentStock: number, avgDailyUse: number): number {
  if (avgDailyUse <= 0) return Infinity;
  return round2(currentStock / avgDailyUse);
}

// ──────────────────────────────── NL query parser ─────────────────────────────

const METRIC_KEYWORDS: Record<string, string> = {
  revenue: "sales",
  sales: "sales",
  orders: "sales",
  products: "products",
  "top selling": "products",
  "best sellers": "products",
  inventory: "inventory",
  stock: "inventory",
  "low stock": "inventory",
  "food cost": "foodCost",
  "ingredient cost": "foodCost",
  margin: "foodCost",
  tax: "tax",
  payroll: "payroll",
  customers: "customers",
  crm: "customers",
};

interface DateRange {
  from: string;
  to: string;
  label: string;
}

function parseRelativeDate(query: string, today: Date): DateRange | null {
  const lowerQuery = query.toLowerCase();

  // "today"
  if (/\btoday\b/.test(lowerQuery)) {
    return { from: isoDate(today), to: isoDate(today), label: "today" };
  }

  // "yesterday"
  if (/\byesterday\b/.test(lowerQuery)) {
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    return { from: isoDate(yesterday), to: isoDate(yesterday), label: "yesterday" };
  }

  // "last week" — the 7 days ending yesterday
  if (/\blast\s+week\b/.test(lowerQuery)) {
    const to = new Date(today);
    to.setUTCDate(to.getUTCDate() - 1);
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - 6);
    return { from: isoDate(from), to: isoDate(to), label: "last 7 days" };
  }

  // "this week" — Monday to today
  if (/\bthis\s+week\b/.test(lowerQuery)) {
    const offset = (today.getUTCDay() + 6) % 7; // days since last Monday
    const monday = new Date(today);
    monday.setUTCDate(monday.getUTCDate() - offset);
    return { from: isoDate(monday), to: isoDate(today), label: "this week (Mon-today)" };
  }

  // "last month" — the entire previous calendar month
  if (/\blast\s+month\b/.test(lowerQuery)) {
    const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)); // last day of prev month
    return { from: isoDate(from), to: isoDate(to), label: "last month" };
  }

  // "this month" — 1st of current month to today
  if (/\bthis\s+month\b/.test(lowerQuery)) {
    const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    return { from: isoDate(from), to: isoDate(today), label: "this month" };
  }

  // "last 30 days"
  if (/\blast\s+30\s+days?\b/.test(lowerQuery)) {
    const to = new Date(today);
    to.setUTCDate(to.getUTCDate() - 1);
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - 29);
    return { from: isoDate(from), to: isoDate(to), label: "last 30 days" };
  }

  // Default: last 7 days
  const to = new Date(today);
  to.setUTCDate(to.getUTCDate() - 1);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 6);
  return { from: isoDate(from), to: isoDate(to), label: "last 7 days (default)" };
}

/**
 * Parse natural-language query to report parameters.
 * Supports simple patterns like "revenue last week", "top products this month", "low stock items".
 * Falls back to safe defaults when patterns don't match.
 */
export function parseNlQuery(query: string, todayIso: string): NlQueryResult {
  const today = new Date(todayIso + "T00:00:00Z");
  const lowerQuery = query.toLowerCase();

  // Extract metric.
  let metric = "sales"; // default
  for (const [keyword, mappedMetric] of Object.entries(METRIC_KEYWORDS)) {
    if (lowerQuery.includes(keyword)) {
      metric = mappedMetric;
      break;
    }
  }

  // Extract date range.
  const dateRange = parseRelativeDate(query, today) || {
    from: isoDate(new Date(today.getTime() - 7 * 86400000)),
    to: isoDate(new Date(today.getTime() - 86400000)),
    label: "last 7 days",
  };

  // Special filter for "low stock".
  const filters: Record<string, string> = {};
  if (/\blow\s+stock\b/.test(lowerQuery)) {
    filters.lowStock = "true";
  }

  // Granularity hints — require explicit adverbial forms to avoid matching
  // date-range phrases like "last week" or "this month".
  let granularity: "day" | "week" | "month" | undefined;
  if (/\bdaily\b/.test(lowerQuery)) granularity = "day";
  else if (/\bweekly\b|\bby\s+week\b/.test(lowerQuery)) granularity = "week";
  else if (/\bmonthly\b|\bby\s+month\b/.test(lowerQuery)) granularity = "month";

  const interpreted = `${metric.charAt(0).toUpperCase() + metric.slice(1)} for ${dateRange.label}`;

  return {
    interpreted,
    from: dateRange.from,
    to: dateRange.to,
    metric,
    granularity,
    filters: Object.keys(filters).length > 0 ? filters : undefined,
  };
}
