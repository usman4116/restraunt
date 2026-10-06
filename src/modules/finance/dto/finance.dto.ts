import { z } from "zod";

const optionalString = (max: number) => z.string().max(max).optional().or(z.literal(""));
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const money = z.coerce.number().min(0).max(99_999_999);

export const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;
export const JOURNAL_STATUSES = ["DRAFT", "POSTED", "REVERSED"] as const;

/** Accounts whose balance grows on the debit side; the rest grow on credit. */
export const DEBIT_NORMAL_TYPES = ["ASSET", "EXPENSE"] as const;

export const accountSchema = z.object({
  code: z
    .string()
    .min(1, "Account code is required")
    .max(20)
    .regex(/^[0-9A-Za-z.-]+$/, "Use digits, letters, dots or dashes"),
  name: z.string().min(1, "Account name is required").max(120),
  type: z.enum(ACCOUNT_TYPES),
  parentId: z.string().uuid().optional().or(z.literal("")),
});

export const journalLineSchema = z.object({
  accountId: z.string().uuid("Pick an account"),
  debit: money.default(0),
  credit: money.default(0),
  memo: optionalString(200),
});

export const journalEntrySchema = z
  .object({
    entryDate: dateOnly,
    memo: optionalString(300),
    referenceType: optionalString(40),
    referenceId: z.string().uuid().optional().nullable(),
    lines: z.array(journalLineSchema).min(2, "An entry needs at least two lines"),
  })
  // A line that is neither a debit nor a credit is noise; one that is both is ambiguous.
  .refine((v) => v.lines.every((l) => (l.debit > 0) !== (l.credit > 0)), {
    message: "Each line must be either a debit or a credit",
    path: ["lines"],
  })
  // The double-entry invariant. Compared in cents so float drift cannot pass.
  .refine(
    (v) => {
      const cents = (n: number) => Math.round(n * 100);
      const debit = v.lines.reduce((sum, l) => sum + cents(l.debit), 0);
      const credit = v.lines.reduce((sum, l) => sum + cents(l.credit), 0);
      return debit === credit && debit > 0;
    },
    { message: "Debits and credits must balance", path: ["lines"] },
  );

export const journalPostSchema = z.object({
  journalEntryId: z.string().uuid(),
});

export const expenseSchema = z.object({
  category: z.string().min(1, "Category is required").max(60),
  description: optionalString(300),
  amount: money.refine((n) => n > 0, "Amount must be greater than zero"),
  taxAmount: money.default(0),
  expenseDate: dateOnly,
  vendorName: optionalString(120),
  accountId: z.string().uuid().optional().or(z.literal("")),
  receiptUrl: z.string().url("Enter a valid URL").max(500).optional().or(z.literal("")),
});

export const financeQuerySchema = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  journalStatus: z.enum(JOURNAL_STATUSES).optional(),
  accountType: z.enum(ACCOUNT_TYPES).optional(),
  search: z.string().max(100).optional(),
});

export type AccountInput = z.output<typeof accountSchema>;
export type JournalLineInput = z.output<typeof journalLineSchema>;
export type JournalEntryInput = z.output<typeof journalEntrySchema>;
export type JournalPostInput = z.output<typeof journalPostSchema>;
export type ExpenseInput = z.output<typeof expenseSchema>;
export type FinanceQuery = z.output<typeof financeQuerySchema>;
