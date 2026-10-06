import { describe, expect, it } from "vitest";
import {
  canTransition,
  isRiderFree,
  riderEarningFor,
  generateOtp,
} from "../service/delivery.service";
import { DELIVERY_STATUSES } from "../dto/delivery.dto";

describe("canTransition", () => {
  it("walks the happy path from dispatch to handover", () => {
    expect(canTransition("PENDING", "ASSIGNED")).toBe(true);
    expect(canTransition("ASSIGNED", "PICKED_UP")).toBe(true);
    expect(canTransition("PICKED_UP", "IN_TRANSIT")).toBe(true);
    expect(canTransition("IN_TRANSIT", "DELIVERED")).toBe(true);
  });

  it("lets dispatch unassign a rider back to the queue", () => {
    expect(canTransition("ASSIGNED", "PENDING")).toBe(true);
    expect(canTransition("PICKED_UP", "PENDING")).toBe(false);
  });

  it("refuses to skip pickup on the way to delivered", () => {
    expect(canTransition("PENDING", "DELIVERED")).toBe(false);
    expect(canTransition("ASSIGNED", "DELIVERED")).toBe(false);
  });

  it("treats DELIVERED and RETURNED as terminal", () => {
    for (const target of DELIVERY_STATUSES) {
      expect(canTransition("DELIVERED", target)).toBe(false);
      expect(canTransition("RETURNED", target)).toBe(false);
    }
  });

  it("allows a failed run to be returned to the kitchen", () => {
    expect(canTransition("FAILED", "RETURNED")).toBe(true);
    expect(canTransition("FAILED", "DELIVERED")).toBe(false);
  });

  it("never allows a self-transition", () => {
    for (const status of DELIVERY_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });
});

describe("isRiderFree", () => {
  it("is free only when available and idle", () => {
    expect(isRiderFree(true, 0)).toBe(true);
    expect(isRiderFree(true, 1)).toBe(false);
    expect(isRiderFree(false, 0)).toBe(false);
    expect(isRiderFree(false, 3)).toBe(false);
  });
});

describe("riderEarningFor", () => {
  it("pays the flat base when the zone charges no fee", () => {
    expect(riderEarningFor(0)).toBe(50);
  });

  it("adds the configured share of the zone fee", () => {
    expect(riderEarningFor(100)).toBe(110);
    expect(riderEarningFor(100, 0, 50)).toBe(50);
  });

  it("rounds to whole cents", () => {
    // 50 + 60% of 33.33 = 69.998, which must not leak sub-cent precision.
    expect(riderEarningFor(33.33)).toBe(70);
    expect(Number.isInteger(riderEarningFor(12.345) * 100)).toBe(true);
  });

  it("never pays less than the base fee", () => {
    for (const fee of [-100, 0, 1, 999]) {
      expect(riderEarningFor(fee)).toBeGreaterThanOrEqual(50);
    }
  });
});

describe("generateOtp", () => {
  it("always returns exactly four digits", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateOtp()).toMatch(/^\d{4}$/);
    }
  });

  it("produces more than one distinct code across many draws", () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateOtp()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
