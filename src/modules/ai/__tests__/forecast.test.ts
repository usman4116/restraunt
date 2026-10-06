import { describe, it, expect } from "vitest";
import {
  weightedMovingAverage,
  linearTrend,
  confidenceBand,
  mape,
  forecastSales,
  daysUntilStockout,
  parseNlQuery,
} from "../service/forecast.service";

// ─────────────────────────── weightedMovingAverage ───────────────────────────

describe("weightedMovingAverage", () => {
  it("returns 0 for empty array", () => {
    expect(weightedMovingAverage([])).toBe(0);
  });

  it("returns the single value for a one-element array", () => {
    expect(weightedMovingAverage([42])).toBe(42);
  });

  it("weights later values more heavily than earlier ones", () => {
    // Values [1, 10]: weights [1, 2]. WMA = (1*1 + 10*2) / (1+2) = 21/3 = 7.
    const result = weightedMovingAverage([1, 10]);
    expect(result).toBeCloseTo(7, 5);
  });

  it("three equal values give the same value as the average", () => {
    expect(weightedMovingAverage([5, 5, 5])).toBeCloseTo(5, 5);
  });

  it("rising sequence yields average closer to later values", () => {
    // [10, 20, 30]: weights [1,2,3]. WMA = (10+40+90)/6 = 140/6 ≈ 23.33.
    const result = weightedMovingAverage([10, 20, 30]);
    expect(result).toBeCloseTo(23.33, 1);
    // Should be closer to 30 than to 10.
    expect(result).toBeGreaterThan(20);
  });
});

// ────────────────────────────── linearTrend ───────────────────────────────────

describe("linearTrend", () => {
  it("returns slope 0 and intercept 0 for empty array", () => {
    const { slope, intercept } = linearTrend([]);
    expect(slope).toBe(0);
    expect(intercept).toBe(0);
  });

  it("returns slope 0 and the value as intercept for a single point", () => {
    const { slope, intercept } = linearTrend([{ x: 3, y: 7 }]);
    expect(slope).toBe(0);
    expect(intercept).toBe(7);
  });

  it("fits a perfect line (y = 2x + 1)", () => {
    const points = [0, 1, 2, 3, 4].map((x) => ({ x, y: 2 * x + 1 }));
    const { slope, intercept } = linearTrend(points);
    expect(slope).toBeCloseTo(2, 5);
    expect(intercept).toBeCloseTo(1, 5);
  });

  it("fits a flat line (all same y)", () => {
    const points = [0, 1, 2, 3].map((x) => ({ x, y: 5 }));
    const { slope, intercept } = linearTrend(points);
    expect(slope).toBeCloseTo(0, 5);
    expect(intercept).toBeCloseTo(5, 5);
  });

  it("detects negative slope for a declining series", () => {
    const points = [0, 1, 2, 3].map((x) => ({ x, y: 100 - 10 * x }));
    const { slope } = linearTrend(points);
    expect(slope).toBeCloseTo(-10, 5);
  });
});

// ─────────────────────────────── confidenceBand ───────────────────────────────

describe("confidenceBand", () => {
  it("lower and upper equal the mean when residuals are empty", () => {
    const { lower, upper } = confidenceBand(100, []);
    expect(lower).toBe(100);
    expect(upper).toBe(100);
  });

  it("lower is clamped to 0 (revenue cannot be negative)", () => {
    // Mean 5, large residuals: lower would go negative.
    const residuals = [-50, 50];
    const { lower } = confidenceBand(5, residuals);
    expect(lower).toBeGreaterThanOrEqual(0);
  });

  it("upper > mean when there is variance", () => {
    const residuals = [-10, 10];
    const { upper } = confidenceBand(100, residuals);
    expect(upper).toBeGreaterThan(100);
  });

  it("band is symmetric around the mean when lower is not clamped", () => {
    const mean = 200;
    const residuals = [-20, 20];
    const { lower, upper } = confidenceBand(mean, residuals);
    const distLower = mean - lower;
    const distUpper = upper - mean;
    expect(distLower).toBeCloseTo(distUpper, 5);
  });

  it("zero residuals yield a zero-width band", () => {
    const { lower, upper } = confidenceBand(50, [0, 0, 0]);
    expect(lower).toBeCloseTo(50, 5);
    expect(upper).toBeCloseTo(50, 5);
  });
});

// ───────────────────────────────── mape ───────────────────────────────────────

describe("mape", () => {
  it("returns 0 for empty arrays", () => {
    expect(mape([], [])).toBe(0);
  });

  it("returns 0 when arrays have different lengths", () => {
    expect(mape([100], [100, 200])).toBe(0);
  });

  it("returns 0 for a perfect prediction", () => {
    expect(mape([100, 200, 300], [100, 200, 300])).toBe(0);
  });

  it("calculates 10% MAPE for a 10% off prediction", () => {
    // predicted 10% over actual in every row.
    const actual = [100, 200, 300];
    const predicted = [110, 220, 330];
    expect(mape(actual, predicted)).toBeCloseTo(10, 1);
  });

  it("skips rows where actual is 0 (no division by zero)", () => {
    // Only the second row counts: |200-400|/200 = 1 = 100%.
    const result = mape([0, 200], [100, 400]);
    expect(result).toBeCloseTo(100, 1);
  });

  it("returns 0 when all actual values are 0", () => {
    expect(mape([0, 0], [100, 200])).toBe(0);
  });
});

// ─────────────────────────────── forecastSales ───────────────────────────────

describe("forecastSales", () => {
  it("returns one point per horizon day", () => {
    const history = Array.from({ length: 14 }, (_, i) => 100 + i);
    const points = forecastSales(history, 7);
    expect(points).toHaveLength(7);
  });

  it("returns zeros for empty history", () => {
    const points = forecastSales([], 3);
    expect(points).toHaveLength(3);
    for (const p of points) {
      expect(p.predicted).toBe(0);
      expect(p.lower).toBe(0);
      expect(p.upper).toBe(0);
    }
  });

  it("produces dates after the last historical day (sequential)", () => {
    const history = Array.from({ length: 14 }, () => 500);
    const points = forecastSales(history, 3);
    // Each date should be parseable and sequential.
    const dates = points.map((p) => new Date(p.date).getTime());
    expect(dates[1]).toBeGreaterThan(dates[0]);
    expect(dates[2]).toBeGreaterThan(dates[1]);
  });

  it("upper >= predicted >= lower >= 0", () => {
    const history = Array.from({ length: 30 }, (_, i) => 1000 + Math.sin(i) * 200);
    const points = forecastSales(history, 7);
    for (const p of points) {
      expect(p.lower).toBeGreaterThanOrEqual(0);
      expect(p.predicted).toBeGreaterThanOrEqual(p.lower);
      expect(p.upper).toBeGreaterThanOrEqual(p.predicted);
    }
  });

  it("constant history predicts the same constant value", () => {
    const history = Array.from({ length: 28 }, () => 1000);
    const points = forecastSales(history, 7);
    for (const p of points) {
      expect(p.predicted).toBeCloseTo(1000, 0);
    }
  });

  it("strongly rising trend produces increasing forecast values", () => {
    // 60 days of history with a steep upward slope.
    const history = Array.from({ length: 60 }, (_, i) => i * 10);
    const points = forecastSales(history, 5);
    for (let i = 1; i < points.length; i++) {
      // Each subsequent day should be higher given a rising trend.
      expect(points[i].predicted).toBeGreaterThanOrEqual(points[i - 1].predicted - 1);
    }
  });
});

// ─────────────────────────── daysUntilStockout ───────────────────────────────

describe("daysUntilStockout", () => {
  it("returns Infinity when avgDailyUse is 0", () => {
    expect(daysUntilStockout(100, 0)).toBe(Infinity);
  });

  it("returns Infinity when avgDailyUse is negative", () => {
    expect(daysUntilStockout(100, -5)).toBe(Infinity);
  });

  it("calculates days correctly", () => {
    expect(daysUntilStockout(30, 5)).toBeCloseTo(6, 2);
  });

  it("returns 0 when there is no stock", () => {
    expect(daysUntilStockout(0, 5)).toBe(0);
  });

  it("handles fractional stock and use", () => {
    expect(daysUntilStockout(7.5, 2.5)).toBeCloseTo(3, 2);
  });
});

// ──────────────────────────── parseNlQuery ───────────────────────────────────

describe("parseNlQuery", () => {
  const today = "2026-08-06";

  it("defaults to sales metric when no keyword matches", () => {
    const r = parseNlQuery("show me the numbers", today);
    expect(r.metric).toBe("sales");
  });

  it("maps 'revenue' to sales", () => {
    expect(parseNlQuery("revenue this month", today).metric).toBe("sales");
  });

  it("maps 'inventory' to inventory", () => {
    expect(parseNlQuery("inventory levels last week", today).metric).toBe("inventory");
  });

  it("maps 'low stock' to inventory", () => {
    const r = parseNlQuery("low stock items", today);
    expect(r.metric).toBe("inventory");
    expect(r.filters?.lowStock).toBe("true");
  });

  it("maps 'food cost' to foodCost", () => {
    expect(parseNlQuery("food cost this month", today).metric).toBe("foodCost");
  });

  it("maps 'payroll' to payroll", () => {
    expect(parseNlQuery("payroll last month", today).metric).toBe("payroll");
  });

  it("maps 'customers' to customers", () => {
    expect(parseNlQuery("customers this week", today).metric).toBe("customers");
  });

  it("resolves 'today' date range", () => {
    const r = parseNlQuery("revenue today", today);
    expect(r.from).toBe(today);
    expect(r.to).toBe(today);
  });

  it("resolves 'yesterday' to the day before today", () => {
    const r = parseNlQuery("orders yesterday", today);
    expect(r.from).toBe("2026-08-05");
    expect(r.to).toBe("2026-08-05");
  });

  it("resolves 'this month' to 2026-08-01 through today", () => {
    const r = parseNlQuery("revenue this month", today);
    expect(r.from).toBe("2026-08-01");
    expect(r.to).toBe(today);
  });

  it("resolves 'last month' to July 2026", () => {
    const r = parseNlQuery("tax last month", today);
    expect(r.from).toBe("2026-07-01");
    expect(r.to).toBe("2026-07-31");
  });

  it("extracts 'weekly' granularity hint", () => {
    expect(parseNlQuery("weekly revenue this month", today).granularity).toBe("week");
  });

  it("extracts 'monthly' granularity hint", () => {
    expect(parseNlQuery("monthly sales", today).granularity).toBe("month");
  });

  it("extracts 'daily' granularity hint", () => {
    expect(parseNlQuery("daily orders last 30 days", today).granularity).toBe("day");
  });

  it("omits granularity when no hint is present", () => {
    expect(parseNlQuery("revenue last week", today).granularity).toBeUndefined();
  });

  it("returns a human-readable interpreted string", () => {
    const r = parseNlQuery("revenue last week", today);
    expect(typeof r.interpreted).toBe("string");
    expect(r.interpreted.length).toBeGreaterThan(3);
  });

  it("resolves 'last 30 days'", () => {
    const r = parseNlQuery("revenue last 30 days", today);
    // Window is 30 days ending yesterday (2026-08-05).
    expect(r.to).toBe("2026-08-05");
    // from should be 30 days before that.
    const from = new Date(r.from);
    const to = new Date(r.to);
    const diffDays = Math.round((to.getTime() - from.getTime()) / 86400000);
    expect(diffDays).toBe(29); // 30 days inclusive → 29 day gap
  });
});
