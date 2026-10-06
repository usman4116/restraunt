import { describe, it, expect } from "vitest";
import {
  isBalanced,
  accountBalance,
  canPostJournal,
  canReverseJournal,
  canEditJournal,
  nextEntryNumber,
  netProfit,
  profitMargin,
  balanceSheetBalances,
} from "../service/finance.service";
import { journalEntrySchema } from "../dto/finance.dto";

describe("isBalanced", () => {
  it("accepts a simple two-sided entry", () => {
    expect(isBalanced([{ debit: 100, credit: 0 }, { debit: 0, credit: 100 }])).toBe(true);
  });

  it("accepts a split entry across several lines", () => {
    expect(
      isBalanced([
        { debit: 100, credit: 0 },
        { debit: 0, credit: 60 },
        { debit: 0, credit: 40 },
      ]),
    ).toBe(true);
  });

  it("rejects an entry that does not balance", () => {
    expect(isBalanced([{ debit: 100, credit: 0 }, { debit: 0, credit: 99 }])).toBe(false);
  });

  it("rejects an all-zero entry rather than calling it balanced", () => {
    expect(isBalanced([{ debit: 0, credit: 0 }, { debit: 0, credit: 0 }])).toBe(false);
  });

  it("survives amounts that float arithmetic would break", () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point; comparing cents avoids that.
    expect(
      isBalanced([
        { debit: 0.1, credit: 0 },
        { debit: 0.2, credit: 0 },
        { debit: 0, credit: 0.3 },
      ]),
    ).toBe(true);
  });
});

describe("accountBalance", () => {
  it("grows an asset on the debit side", () => {
    expect(accountBalance("ASSET", 500, 200)).toBe(300);
  });

  it("grows an expense on the debit side", () => {
    expect(accountBalance("EXPENSE", 80, 0)).toBe(80);
  });

  it("grows revenue on the credit side", () => {
    expect(accountBalance("REVENUE", 0, 900)).toBe(900);
  });

  it("grows a liability on the credit side", () => {
    expect(accountBalance("LIABILITY", 100, 400)).toBe(300);
  });

  it("goes negative when an account is used contrary to its nature", () => {
    expect(accountBalance("ASSET", 0, 50)).toBe(-50);
  });
});

describe("journal status guards", () => {
  it("only lets drafts be posted", () => {
    expect(canPostJournal("DRAFT")).toBe(true);
    expect(canPostJournal("POSTED")).toBe(false);
    expect(canPostJournal("REVERSED")).toBe(false);
  });

  it("only lets posted entries be reversed", () => {
    expect(canReverseJournal("POSTED")).toBe(true);
    expect(canReverseJournal("DRAFT")).toBe(false);
    expect(canReverseJournal("REVERSED")).toBe(false);
  });

  it("only lets drafts be edited", () => {
    expect(canEditJournal("DRAFT")).toBe(true);
    expect(canEditJournal("POSTED")).toBe(false);
  });
});

describe("nextEntryNumber", () => {
  it("starts the sequence at one", () => {
    expect(nextEntryNumber(null)).toBe("JE-000001");
  });

  it("increments the previous number", () => {
    expect(nextEntryNumber("JE-000041")).toBe("JE-000042");
  });

  it("carries past a padding boundary", () => {
    expect(nextEntryNumber("JE-000999")).toBe("JE-001000");
  });
});

describe("netProfit and profitMargin", () => {
  it("subtracts expenses from revenue", () => {
    expect(netProfit(1000, 400)).toBe(600);
  });

  it("reports a loss as a negative number", () => {
    expect(netProfit(300, 500)).toBe(-200);
  });

  it("expresses margin to one decimal", () => {
    expect(profitMargin(1000, 335)).toBe(33.5);
  });

  it("returns zero margin rather than dividing by zero revenue", () => {
    expect(profitMargin(0, -200)).toBe(0);
  });
});

describe("balanceSheetBalances", () => {
  it("holds when assets equal liabilities plus equity", () => {
    expect(balanceSheetBalances(1500, 500, 1000)).toBe(true);
  });

  it("fails when the two sides disagree", () => {
    expect(balanceSheetBalances(1500, 500, 900)).toBe(false);
  });

  it("tolerates cent-level float representation", () => {
    expect(balanceSheetBalances(0.3, 0.1, 0.2)).toBe(true);
  });
});

describe("journalEntrySchema", () => {
  const line = (accountId: string, debit: number, credit: number) => ({
    accountId,
    debit,
    credit,
    memo: "",
  });
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";

  it("accepts a balanced entry", () => {
    const result = journalEntrySchema.safeParse({
      entryDate: "2026-05-01",
      memo: "Cash sale",
      lines: [line(A, 250, 0), line(B, 0, 250)],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unbalanced entry", () => {
    const result = journalEntrySchema.safeParse({
      entryDate: "2026-05-01",
      lines: [line(A, 250, 0), line(B, 0, 100)],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a line that is both a debit and a credit", () => {
    const result = journalEntrySchema.safeParse({
      entryDate: "2026-05-01",
      lines: [line(A, 100, 100), line(B, 0, 0)],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a single-line entry", () => {
    const result = journalEntrySchema.safeParse({
      entryDate: "2026-05-01",
      lines: [line(A, 100, 0)],
    });
    expect(result.success).toBe(false);
  });
});
