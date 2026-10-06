import { describe, it, expect } from "vitest";
import { weightedAverageCost } from "../service/purchasing.service";

describe("weightedAverageCost", () => {
  it("blends existing stock cost with the received cost", () => {
    // 10 units @ $4 on hand + 10 units @ $6 received → $5
    expect(weightedAverageCost(10, 4, 10, 6)).toBe(5);
  });

  it("uses the receipt cost when nothing is on hand", () => {
    expect(weightedAverageCost(0, 4, 5, 7)).toBe(7);
  });

  it("clamps negative on-hand to zero instead of skewing the average", () => {
    // Oversold stock must not produce a cost outside [avgCost, unitCost]
    expect(weightedAverageCost(-3, 4, 5, 7)).toBe(7);
  });

  it("keeps the old average when the receipt is tiny relative to stock", () => {
    const result = weightedAverageCost(1000, 4, 1, 10);
    expect(result).toBeGreaterThan(4);
    expect(result).toBeLessThan(4.01);
  });

  it("falls back to unit cost when both quantities are zero", () => {
    expect(weightedAverageCost(0, 4, 0, 9)).toBe(9);
  });

  it("rounds to 4 decimal places", () => {
    expect(weightedAverageCost(3, 1, 3, 2)).toBe(1.5);
    expect(String(weightedAverageCost(7, 1.3333, 3, 2.7777)).length).toBeLessThanOrEqual(6);
  });
});
