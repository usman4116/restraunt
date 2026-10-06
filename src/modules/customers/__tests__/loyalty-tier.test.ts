import { describe, it, expect } from "vitest";
import { tierForSpend, LOYALTY_TIERS } from "../service/customer.service";

describe("tierForSpend", () => {
  it("assigns BRONZE to new customers", () => {
    expect(tierForSpend(0)).toBe("BRONZE");
    expect(tierForSpend(499.99)).toBe("BRONZE");
  });

  it("promotes at each threshold boundary", () => {
    expect(tierForSpend(500)).toBe("SILVER");
    expect(tierForSpend(2000)).toBe("GOLD");
    expect(tierForSpend(5000)).toBe("PLATINUM");
  });

  it("keeps the highest tier above the top threshold", () => {
    expect(tierForSpend(50_000)).toBe("PLATINUM");
  });

  it("orders thresholds from highest to lowest so the first match wins", () => {
    const thresholds = LOYALTY_TIERS.map((t) => t.minSpend);
    expect(thresholds).toEqual([...thresholds].sort((a, b) => b - a));
  });
});
