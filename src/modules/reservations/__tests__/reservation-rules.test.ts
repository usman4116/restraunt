import { describe, expect, it } from "vitest";
import { canTransition, overlaps } from "../service/reservation.service";
import { RESERVATION_STATUSES } from "../dto/reservation.dto";

describe("canTransition", () => {
  it("walks the happy path from booking to completion", () => {
    expect(canTransition("PENDING", "CONFIRMED")).toBe(true);
    expect(canTransition("CONFIRMED", "SEATED")).toBe(true);
    expect(canTransition("SEATED", "COMPLETED")).toBe(true);
  });

  it("allows seating a walk-in booking without confirming first", () => {
    expect(canTransition("PENDING", "SEATED")).toBe(true);
  });

  it("refuses to move backwards", () => {
    expect(canTransition("SEATED", "PENDING")).toBe(false);
    expect(canTransition("COMPLETED", "SEATED")).toBe(false);
    expect(canTransition("CONFIRMED", "PENDING")).toBe(false);
  });

  it("treats COMPLETED, CANCELLED and NO_SHOW as terminal", () => {
    for (const terminal of ["COMPLETED", "CANCELLED", "NO_SHOW"] as const) {
      for (const target of RESERVATION_STATUSES) {
        expect(canTransition(terminal, target)).toBe(false);
      }
    }
  });

  it("never allows a self-transition", () => {
    for (const status of RESERVATION_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("cannot cancel a booking that is already finished", () => {
    expect(canTransition("SEATED", "CANCELLED")).toBe(true);
    expect(canTransition("COMPLETED", "CANCELLED")).toBe(false);
  });
});

describe("overlaps", () => {
  const at = (hhmm: string) => new Date(`2026-08-05T${hhmm}:00`);

  it("detects a booking starting inside an existing sitting", () => {
    expect(overlaps(at("19:00"), 90, at("20:00"), 90)).toBe(true);
  });

  it("detects an existing sitting starting inside the new booking", () => {
    expect(overlaps(at("20:00"), 90, at("19:00"), 90)).toBe(true);
  });

  it("allows back-to-back bookings that touch at the boundary", () => {
    expect(overlaps(at("19:00"), 60, at("20:00"), 60)).toBe(false);
    expect(overlaps(at("20:00"), 60, at("19:00"), 60)).toBe(false);
  });

  it("allows bookings separated by a gap", () => {
    expect(overlaps(at("18:00"), 60, at("21:00"), 60)).toBe(false);
  });

  it("detects a booking fully contained in a longer one", () => {
    expect(overlaps(at("18:00"), 240, at("19:00"), 60)).toBe(true);
  });

  it("is symmetric for every pair it is asked about", () => {
    const pairs: [string, number, string, number][] = [
      ["19:00", 90, "20:00", 90],
      ["19:00", 60, "20:00", 60],
      ["18:00", 240, "19:00", 60],
      ["12:00", 30, "23:00", 30],
    ];
    for (const [aStart, aDur, bStart, bDur] of pairs) {
      expect(overlaps(at(aStart), aDur, at(bStart), bDur)).toBe(
        overlaps(at(bStart), bDur, at(aStart), aDur),
      );
    }
  });
});
