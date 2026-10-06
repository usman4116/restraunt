import { describe, it, expect } from "vitest";
import {
  lineTotal,
  invoiceTotals,
  amountDue,
  statusAfterPayment,
  isOverdue,
  daysOverdue,
  ageingBucket,
  canEditInvoice,
  canIssueInvoice,
  canPayInvoice,
  canVoidInvoice,
  nextInvoiceNumber,
  invoicePrefix,
  cashFlowActivity,
  signedAmount,
  runningBalance,
} from "../service/invoicing.service";

// ─────────────────────────────── lineTotal ────────────────────────────────

describe("lineTotal", () => {
  it("multiplies qty × unit with no tax", () => {
    expect(lineTotal({ quantity: 5, unitPrice: 20, taxRate: 0 })).toBe(100);
  });
  it("applies tax correctly", () => {
    // 10 × 100 × (1 + 0.10) = 1100
    expect(lineTotal({ quantity: 10, unitPrice: 100, taxRate: 10 })).toBe(1100);
  });
  it("rounds to 2 decimal places", () => {
    // 3 × 3.33 = 9.99; tax 5% → 9.99 × 1.05 = 10.4895 → 10.49
    expect(lineTotal({ quantity: 3, unitPrice: 3.33, taxRate: 5 })).toBe(10.49);
  });
  it("returns 0 for zero quantity", () => {
    expect(lineTotal({ quantity: 0, unitPrice: 50, taxRate: 20 })).toBe(0);
  });
});

// ─────────────────────────────── invoiceTotals ────────────────────────────

describe("invoiceTotals", () => {
  it("sums multi-line invoice with mixed tax rates", () => {
    const lines = [
      { quantity: 2, unitPrice: 100, taxRate: 10, description: "Line A" },  // 200 + 20 = 220
      { quantity: 1, unitPrice: 50,  taxRate: 0,  description: "Line B" },  //  50 +  0 =  50
    ];
    const result = invoiceTotals(lines);
    expect(result.subtotal).toBe(250);
    expect(result.taxAmount).toBe(20);
    expect(result.totalAmount).toBe(270);
  });
  it("returns all zeros for an empty line list", () => {
    const result = invoiceTotals([]);
    expect(result.subtotal).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(result.totalAmount).toBe(0);
  });
  it("subtotal + taxAmount === totalAmount (no rounding leak)", () => {
    const lines = [
      { quantity: 3, unitPrice: 1.10, taxRate: 7, description: "A" },
      { quantity: 7, unitPrice: 0.99, taxRate: 7, description: "B" },
    ];
    const { subtotal, taxAmount, totalAmount } = invoiceTotals(lines);
    // Compare in cents to avoid float equality issues.
    expect(Math.round(totalAmount * 100)).toBe(Math.round((subtotal + taxAmount) * 100));
  });
});

// ─────────────────────────────── amountDue ────────────────────────────────

describe("amountDue", () => {
  it("returns remaining balance", () => {
    expect(amountDue(1000, 400)).toBe(600);
  });
  it("clamps to zero when overpaid", () => {
    // Should never happen in practice, but must not go negative.
    expect(amountDue(1000, 1001)).toBe(0);
  });
  it("returns full total when nothing paid", () => {
    expect(amountDue(500, 0)).toBe(500);
  });
});

// ─────────────────────────────── statusAfterPayment ───────────────────────

describe("statusAfterPayment", () => {
  it("PAID when amount paid reaches total", () => {
    expect(statusAfterPayment("ISSUED", 500, 500)).toBe("PAID");
  });
  it("PARTIALLY_PAID when partial", () => {
    expect(statusAfterPayment("ISSUED", 500, 100)).toBe("PARTIALLY_PAID");
  });
  it("PARTIALLY_PAID stays when partially paying a PARTIALLY_PAID invoice", () => {
    expect(statusAfterPayment("PARTIALLY_PAID", 500, 300)).toBe("PARTIALLY_PAID");
  });
  it("ISSUED reverts if partial payment is undone (amountPaid 0)", () => {
    expect(statusAfterPayment("PARTIALLY_PAID", 500, 0)).toBe("ISSUED");
  });
  it("does not change DRAFT status", () => {
    expect(statusAfterPayment("DRAFT", 500, 0)).toBe("DRAFT");
  });
  it("does not change VOID status", () => {
    expect(statusAfterPayment("VOID", 500, 0)).toBe("VOID");
  });
  it("uses cent comparison — a one-cent rounding sliver does not block PAID", () => {
    // 99.999... floating-point representation: stored as 100.00 in DB
    expect(statusAfterPayment("ISSUED", 100, 100.00)).toBe("PAID");
  });
});

// ─────────────────────────────── isOverdue ────────────────────────────────

describe("isOverdue", () => {
  const dueYesterday = new Date(Date.now() - 86_400_000);
  const dueTomorrow  = new Date(Date.now() + 86_400_000);
  const asOf = new Date();

  it("true when issued, past due, unpaid", () => {
    expect(isOverdue("ISSUED", dueYesterday, asOf, 500, 0)).toBe(true);
  });
  it("false when issued but not yet past due", () => {
    expect(isOverdue("ISSUED", dueTomorrow, asOf, 500, 0)).toBe(false);
  });
  it("false when fully paid", () => {
    expect(isOverdue("ISSUED", dueYesterday, asOf, 500, 500)).toBe(false);
  });
  it("false for DRAFT regardless of date", () => {
    expect(isOverdue("DRAFT", dueYesterday, asOf, 500, 0)).toBe(false);
  });
  it("false for PAID regardless of date", () => {
    expect(isOverdue("PAID", dueYesterday, asOf, 500, 500)).toBe(false);
  });
  it("false for VOID", () => {
    expect(isOverdue("VOID", dueYesterday, asOf, 500, 0)).toBe(false);
  });
  it("true for PARTIALLY_PAID that is past due", () => {
    expect(isOverdue("PARTIALLY_PAID", dueYesterday, asOf, 500, 100)).toBe(true);
  });
});

// ─────────────────────────────── daysOverdue ──────────────────────────────

describe("daysOverdue", () => {
  it("returns 0 when due date is in the future", () => {
    const tomorrow = new Date(Date.now() + 86_400_000);
    expect(daysOverdue(tomorrow, new Date())).toBe(0);
  });
  it("returns 0 on the exact due date", () => {
    const now = new Date();
    expect(daysOverdue(now, now)).toBe(0);
  });
  it("returns 1 for exactly one day past due", () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    expect(daysOverdue(yesterday, new Date())).toBe(1);
  });
  it("returns 45 for 45 days past due", () => {
    const past = new Date(Date.now() - 45 * 86_400_000);
    expect(daysOverdue(past, new Date())).toBe(45);
  });
});

// ─────────────────────────────── ageingBucket ─────────────────────────────

describe("ageingBucket", () => {
  it("current for 0 days", ()  => expect(ageingBucket(0)).toBe("current"));
  it("current for -5 days",  () => expect(ageingBucket(-5)).toBe("current"));
  it("1-30 for 1 day",       () => expect(ageingBucket(1)).toBe("1-30"));
  it("1-30 for 30 days",     () => expect(ageingBucket(30)).toBe("1-30"));
  it("31-60 for 31 days",    () => expect(ageingBucket(31)).toBe("31-60"));
  it("31-60 for 60 days",    () => expect(ageingBucket(60)).toBe("31-60"));
  it("61-90 for 61 days",    () => expect(ageingBucket(61)).toBe("61-90"));
  it("61-90 for 90 days",    () => expect(ageingBucket(90)).toBe("61-90"));
  it("90+ for 91 days",      () => expect(ageingBucket(91)).toBe("90+"));
  it("90+ for 365 days",     () => expect(ageingBucket(365)).toBe("90+"));
});

// ─────────────────────────── invoice state guards ─────────────────────────

describe("canEditInvoice", () => {
  it("true only for DRAFT", () => {
    expect(canEditInvoice("DRAFT")).toBe(true);
    for (const s of ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"] as const) {
      expect(canEditInvoice(s)).toBe(false);
    }
  });
});

describe("canIssueInvoice", () => {
  it("true only for DRAFT", () => {
    expect(canIssueInvoice("DRAFT")).toBe(true);
    expect(canIssueInvoice("ISSUED")).toBe(false);
  });
});

describe("canPayInvoice", () => {
  it("true for ISSUED, PARTIALLY_PAID, OVERDUE", () => {
    for (const s of ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] as const) {
      expect(canPayInvoice(s)).toBe(true);
    }
  });
  it("false for DRAFT, PAID, VOID", () => {
    for (const s of ["DRAFT", "PAID", "VOID"] as const) {
      expect(canPayInvoice(s)).toBe(false);
    }
  });
});

describe("canVoidInvoice", () => {
  it("true for unpaid ISSUED", () => {
    expect(canVoidInvoice("ISSUED", 0)).toBe(true);
  });
  it("false when any amount has been paid", () => {
    expect(canVoidInvoice("ISSUED", 1)).toBe(false);
  });
  it("false for PAID", () => {
    expect(canVoidInvoice("PAID", 500)).toBe(false);
  });
  it("false for VOID", () => {
    expect(canVoidInvoice("VOID", 0)).toBe(false);
  });
  it("true for unpaid DRAFT (edge case — draft can also be voided)", () => {
    expect(canVoidInvoice("DRAFT", 0)).toBe(true);
  });
});

// ─────────────────────────── nextInvoiceNumber ────────────────────────────

describe("nextInvoiceNumber", () => {
  it("starts at 000001 when no prior exists", () => {
    expect(nextInvoiceNumber("INV", null)).toBe("INV-000001");
  });
  it("increments from the last number", () => {
    expect(nextInvoiceNumber("INV", "INV-000042")).toBe("INV-000043");
  });
  it("pads correctly at high numbers", () => {
    expect(nextInvoiceNumber("BILL", "BILL-000999")).toBe("BILL-001000");
  });
  it("uses the supplied prefix for BILL", () => {
    expect(nextInvoiceNumber("BILL", null)).toBe("BILL-000001");
  });
});

describe("invoicePrefix", () => {
  it("INV for SALES", () => expect(invoicePrefix("SALES")).toBe("INV"));
  it("BILL for PURCHASE", () => expect(invoicePrefix("PURCHASE")).toBe("BILL"));
});

// ─────────────────────────── cashFlowActivity ─────────────────────────────

describe("cashFlowActivity", () => {
  it("OPERATING for null", () => expect(cashFlowActivity(null)).toBe("OPERATING"));
  it("OPERATING for empty string", () => expect(cashFlowActivity("")).toBe("OPERATING"));
  it("OPERATING for Sales", () => expect(cashFlowActivity("Sales")).toBe("OPERATING"));
  it("OPERATING for Payroll", () => expect(cashFlowActivity("Payroll")).toBe("OPERATING"));
  it("INVESTING for equipment", () => expect(cashFlowActivity("equipment")).toBe("INVESTING"));
  it("INVESTING for 'Asset Purchase'", () => expect(cashFlowActivity("Asset Purchase")).toBe("INVESTING"));
  it("INVESTING for renovation (case insensitive)", () => expect(cashFlowActivity("Renovation")).toBe("INVESTING"));
  it("FINANCING for loan", () => expect(cashFlowActivity("loan")).toBe("FINANCING"));
  it("FINANCING for 'Loan Repayment'", () => expect(cashFlowActivity("Loan Repayment")).toBe("FINANCING"));
  it("FINANCING for capital", () => expect(cashFlowActivity("capital")).toBe("FINANCING"));
  it("FINANCING for 'Owner Draw'", () => expect(cashFlowActivity("Owner Draw")).toBe("FINANCING"));
  it("unknown category falls back to OPERATING", () => {
    expect(cashFlowActivity("random category")).toBe("OPERATING");
  });
});

// ─────────────────────────── signedAmount ─────────────────────────────────

describe("signedAmount", () => {
  it("INFLOW is positive", () => expect(signedAmount("INFLOW", 500)).toBe(500));
  it("OUTFLOW is negative", () => expect(signedAmount("OUTFLOW", 500)).toBe(-500));
  it("preserves decimal values", () => expect(signedAmount("OUTFLOW", 12.75)).toBe(-12.75));
});

// ─────────────────────────── runningBalance ───────────────────────────────

describe("runningBalance", () => {
  it("returns opening balance when no rows", () => {
    expect(runningBalance(1000, [])).toBe(1000);
  });
  it("adds inflows and subtracts outflows", () => {
    const rows = [
      { direction: "INFLOW" as const,  amount: 500 },
      { direction: "OUTFLOW" as const, amount: 200 },
    ];
    expect(runningBalance(1000, rows)).toBe(1300);
  });
  it("works from zero opening balance", () => {
    const rows = [
      { direction: "INFLOW" as const,  amount: 800 },
      { direction: "OUTFLOW" as const, amount: 800 },
    ];
    expect(runningBalance(0, rows)).toBe(0);
  });
  it("negative result is possible (overdraft)", () => {
    const rows = [{ direction: "OUTFLOW" as const, amount: 200 }];
    expect(runningBalance(100, rows)).toBe(-100);
  });
});
