import { describe, it, expect } from "vitest";
import {
  workedMinutes,
  overtimeMinutes,
  leaveDays,
  canDecideLeave,
  canAdvancePayroll,
  computePayrollEntry,
} from "../service/hr.service";

describe("workedMinutes", () => {
  it("measures a plain day shift", () => {
    expect(workedMinutes("09:00", "17:00")).toBe(480);
  });

  it("counts partial hours", () => {
    expect(workedMinutes("09:15", "13:45")).toBe(270);
  });

  it("wraps a shift that crosses midnight", () => {
    expect(workedMinutes("22:00", "06:00")).toBe(480);
  });

  it("treats identical times as a full 0, not a full day", () => {
    expect(workedMinutes("09:00", "09:00")).toBe(0);
  });
});

describe("overtimeMinutes", () => {
  it("is zero for a standard day", () => {
    expect(overtimeMinutes(480)).toBe(0);
  });

  it("never goes negative for a short day", () => {
    expect(overtimeMinutes(300)).toBe(0);
  });

  it("counts the excess past the standard day", () => {
    expect(overtimeMinutes(600)).toBe(120);
  });

  it("honours a custom standard day", () => {
    expect(overtimeMinutes(480, 360)).toBe(120);
  });
});

describe("leaveDays", () => {
  it("counts a single day as one, not zero", () => {
    expect(leaveDays("2026-03-10", "2026-03-10")).toBe(1);
  });

  it("is inclusive of both ends", () => {
    expect(leaveDays("2026-03-10", "2026-03-14")).toBe(5);
  });

  it("spans month boundaries", () => {
    expect(leaveDays("2026-02-27", "2026-03-02")).toBe(4);
  });
});

describe("canDecideLeave", () => {
  it("lets a manager approve or reject a pending request", () => {
    expect(canDecideLeave("PENDING", "APPROVED")).toBe(true);
    expect(canDecideLeave("PENDING", "REJECTED")).toBe(true);
  });

  it("lets approved leave be cancelled", () => {
    expect(canDecideLeave("APPROVED", "CANCELLED")).toBe(true);
  });

  it("refuses to revive a rejected request", () => {
    expect(canDecideLeave("REJECTED", "APPROVED")).toBe(false);
  });

  it("treats cancelled as terminal", () => {
    expect(canDecideLeave("CANCELLED", "APPROVED")).toBe(false);
  });
});

describe("canAdvancePayroll", () => {
  it("walks the happy path", () => {
    expect(canAdvancePayroll("DRAFT", "PENDING_APPROVAL")).toBe(true);
    expect(canAdvancePayroll("PENDING_APPROVAL", "APPROVED")).toBe(true);
    expect(canAdvancePayroll("APPROVED", "PAID")).toBe(true);
  });

  it("allows one step back for corrections", () => {
    expect(canAdvancePayroll("PENDING_APPROVAL", "DRAFT")).toBe(true);
    expect(canAdvancePayroll("APPROVED", "PENDING_APPROVAL")).toBe(true);
  });

  it("refuses to skip approval", () => {
    expect(canAdvancePayroll("DRAFT", "PAID")).toBe(false);
  });

  it("locks a paid run", () => {
    expect(canAdvancePayroll("PAID", "APPROVED")).toBe(false);
    expect(canAdvancePayroll("PAID", "DRAFT")).toBe(false);
  });
});

describe("computePayrollEntry", () => {
  it("pays a monthly employee their full base with no overtime", () => {
    const entry = computePayrollEntry({
      salaryType: "MONTHLY",
      salaryBase: 2400,
      hourlyRate: 0,
      workedMinutes: 0,
      overtimeMinutes: 0,
    });
    expect(entry.baseSalary).toBe(2400);
    expect(entry.overtimePay).toBe(0);
    expect(entry.gross).toBe(2400);
    expect(entry.taxWithheld).toBe(240);
    expect(entry.netPay).toBe(2160);
  });

  it("pays an hourly employee for the minutes actually worked", () => {
    const entry = computePayrollEntry({
      salaryType: "HOURLY",
      salaryBase: 0,
      hourlyRate: 20,
      workedMinutes: 60 * 100,
      overtimeMinutes: 0,
    });
    expect(entry.baseSalary).toBe(2000);
    expect(entry.gross).toBe(2000);
  });

  it("pays overtime at time-and-a-half", () => {
    const entry = computePayrollEntry({
      salaryType: "HOURLY",
      salaryBase: 0,
      hourlyRate: 20,
      workedMinutes: 0,
      overtimeMinutes: 120,
    });
    // 2h at 20/h × 1.5 = 60
    expect(entry.overtimePay).toBe(60);
  });

  it("derives a monthly employee's overtime rate from a 240-hour month", () => {
    const entry = computePayrollEntry({
      salaryType: "MONTHLY",
      salaryBase: 2400,
      hourlyRate: 0,
      workedMinutes: 0,
      overtimeMinutes: 60,
    });
    // 2400/240 = 10/h, × 1.5 for one overtime hour
    expect(entry.overtimePay).toBe(15);
    expect(entry.gross).toBe(2415);
  });

  it("honours a custom tax rate and keeps money at two decimals", () => {
    const entry = computePayrollEntry({
      salaryType: "MONTHLY",
      salaryBase: 3333.33,
      hourlyRate: 0,
      workedMinutes: 0,
      overtimeMinutes: 0,
      taxRatePct: 15,
    });
    expect(entry.taxWithheld).toBe(500);
    expect(entry.netPay).toBe(2833.33);
  });

  it("withholds nothing when the tax rate is zero", () => {
    const entry = computePayrollEntry({
      salaryType: "MONTHLY",
      salaryBase: 1000,
      hourlyRate: 0,
      workedMinutes: 0,
      overtimeMinutes: 0,
      taxRatePct: 0,
    });
    expect(entry.taxWithheld).toBe(0);
    expect(entry.netPay).toBe(1000);
  });
});
