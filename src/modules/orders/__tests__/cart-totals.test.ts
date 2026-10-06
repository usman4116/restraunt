import { describe, it, expect } from "vitest";
import { cartTotals } from "../store/cart.store";

const line = (unitPrice: number, quantity: number, taxRate = 8) => ({
  key: `${unitPrice}:${quantity}`,
  menuItemId: "m",
  variantId: null,
  name: "Item",
  unitPrice,
  taxRate,
  quantity,
});

describe("cartTotals", () => {
  it("computes subtotal, tax, and total for a plain cart", () => {
    const totals = cartTotals({ lines: [line(10, 2), line(5, 1)], discount: null, tipAmount: 0 });
    expect(totals.subtotal).toBe(25);
    expect(totals.discountAmount).toBe(0);
    expect(totals.taxAmount).toBe(2);
    expect(totals.total).toBe(27);
  });

  it("applies percentage discounts before tax", () => {
    const totals = cartTotals({
      lines: [line(100, 1)],
      discount: { type: "PERCENTAGE", value: 10 },
      tipAmount: 0,
    });
    expect(totals.discountAmount).toBe(10);
    expect(totals.taxAmount).toBe(7.2); // 8% of 90
    expect(totals.total).toBe(97.2);
  });

  it("caps fixed discounts at the subtotal", () => {
    const totals = cartTotals({
      lines: [line(10, 1)],
      discount: { type: "FIXED_AMOUNT", value: 50 },
      tipAmount: 0,
    });
    expect(totals.discountAmount).toBe(10);
    expect(totals.total).toBe(0);
  });

  it("adds tips after tax", () => {
    const totals = cartTotals({ lines: [line(10, 1, 0)], discount: null, tipAmount: 2 });
    expect(totals.taxAmount).toBe(0);
    expect(totals.total).toBe(12);
  });

  it("handles mixed tax rates proportionally", () => {
    const totals = cartTotals({
      lines: [line(10, 1, 10), line(10, 1, 0)],
      discount: null,
      tipAmount: 0,
    });
    expect(totals.taxAmount).toBe(1);
    expect(totals.total).toBe(21);
  });

  it("returns zeros for an empty cart", () => {
    const totals = cartTotals({ lines: [], discount: null, tipAmount: 0 });
    expect(totals).toEqual({ subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0 });
  });
});
