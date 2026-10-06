import { describe, it, expect } from "vitest";
import { computeFoodCost } from "../service/recipe.service";

const cost = (entries: [string, number][]) => new Map(entries);

describe("computeFoodCost", () => {
  it("sums quantity × avgCost per ingredient", () => {
    const rows = [
      { quantity: 0.2, wastePercent: 0 }, // flour
      { quantity: 0.1, wastePercent: 0 }, // cheese
    ];
    const result = computeFoodCost(
      rows,
      cost([["flour", 2], ["cheese", 10]]),
      ["flour", "cheese"],
    );
    expect(result).toBe(0.2 * 2 + 0.1 * 10); // 1.4
  });

  it("applies waste percentage on top of nominal quantity", () => {
    const rows = [{ quantity: 1, wastePercent: 10 }];
    const result = computeFoodCost(rows, cost([["beef", 20]]), ["beef"]);
    expect(result).toBe(22); // 1kg × 1.10 × $20
  });

  it("treats unknown ingredients as zero cost", () => {
    const rows = [{ quantity: 5, wastePercent: 0 }];
    expect(computeFoodCost(rows, cost([]), ["ghost"])).toBe(0);
  });

  it("rounds to 4 decimal places", () => {
    const rows = [{ quantity: 0.333, wastePercent: 0 }];
    const result = computeFoodCost(rows, cost([["oil", 3.333]]), ["oil"]);
    expect(result).toBe(Math.round(0.333 * 3.333 * 10000) / 10000);
  });
});
