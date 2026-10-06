import { z } from "zod";

const optionalString = (max: number) => z.string().max(max).optional().or(z.literal(""));
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const money = z.coerce.number().min(0).max(99_999_999);
const qty = z.coerce.number().min(0).max(9_999_999);

export const INVOICE_DIRECTIONS = ["SALES", "PURCHASE"] as const;
export const INVOICE_STATUSES = [
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "VOID",
] as const;
export const BANK_ACCOUNT_KINDS = [
  "CHECKING",
  "SAVINGS",
  "CASH_DRAWER",
  "MOBILE_WALLET",
  "CREDIT_CARD",
] as const;
export const BANK_DIRECTIONS = ["INFLOW", "OUTFLOW"] as const;
export const PAYMENT_METHODS = [
  "CASH",
  "CARD",
  "MOBILE_WALLET",
  "GIFT_CARD",
  "BANK_TRANSFER",
  "ONLINE",
] as const;

/**
 * Cash-flow activity buckets (IAS 7). Every bank transaction category maps to
 * exactly one of these; anything unrecognised falls to OPERATING, which is where
 * day-to-day restaurant cash actually belongs.
 */
export const CASH_FLOW_ACTIVITIES = ["OPERATING", "INVESTING", "FINANCING"] as const;

export const invoiceLineSchema = z.object({
  description: z.string().min(1, "Describe the line").max(200),
  quantity: qty.refine((n) => n > 0, "Quantity must be greater than zero"),
  unitPrice: money,
  taxRate: z.coerce.number().min(0).max(100).default(0),
  accountId: z.string().uuid().optional().or(z.literal("")),
});

export const invoiceSchema = z
  .object({
    direction: z.enum(INVOICE_DIRECTIONS),
    customerId: z.string().uuid().optional().or(z.literal("")),
    supplierId: z.string().uuid().optional().or(z.literal("")),
    partyName: z.string().min(1, "Who is this invoice for?").max(160),
    issueDate: dateOnly,
    dueDate: dateOnly,
    notes: optionalString(500),
    terms: optionalString(300),
    lines: z.array(invoiceLineSchema).min(1, "An invoice needs at least one line"),
  })
  .refine((v) => v.dueDate >= v.issueDate, {
    message: "Due date cannot be before the issue date",
    path: ["dueDate"],
  })
  // A sales invoice without a customer is fine (walk-in), but a purchase invoice
  // with a customer attached — or vice versa — means the form was mis-filled.
  .refine((v) => !(v.direction === "SALES" && v.supplierId), {
    message: "A sales invoice cannot be addressed to a supplier",
    path: ["supplierId"],
  })
  .refine((v) => !(v.direction === "PURCHASE" && v.customerId), {
    message: "A purchase invoice cannot be addressed to a customer",
    path: ["customerId"],
  })
  .refine((v) => v.lines.some((l) => l.quantity * l.unitPrice > 0), {
    message: "An invoice must total more than zero",
    path: ["lines"],
  });

export const invoicePaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  bankAccountId: z.string().uuid().optional().or(z.literal("")),
  amount: money.refine((n) => n > 0, "Amount must be greater than zero"),
  paidAt: dateOnly,
  method: z.enum(PAYMENT_METHODS).default("BANK_TRANSFER"),
  reference: optionalString(80),
  notes: optionalString(300),
});

export const bankAccountSchema = z.object({
  name: z.string().min(1, "Name the account").max(120),
  kind: z.enum(BANK_ACCOUNT_KINDS),
  bankName: optionalString(120),
  accountNumber: optionalString(40),
  iban: optionalString(40),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter code like USD")
    .default("USD"),
  openingBalance: z.coerce.number().min(-99_999_999).max(99_999_999).default(0),
  glAccountId: z.string().uuid().optional().or(z.literal("")),
  isPrimary: z.coerce.boolean().default(false),
});

export const bankTransactionSchema = z.object({
  bankAccountId: z.string().uuid("Pick an account"),
  direction: z.enum(BANK_DIRECTIONS),
  amount: money.refine((n) => n > 0, "Amount must be greater than zero"),
  txnDate: dateOnly,
  description: z.string().min(1, "Describe the transaction").max(200),
  category: optionalString(60),
  reference: optionalString(80),
  counterparty: optionalString(120),
});

export const invoiceQuerySchema = z.object({
  direction: z.enum(INVOICE_DIRECTIONS).optional(),
  invoiceStatus: z.enum(INVOICE_STATUSES).optional(),
  search: z.string().max(100).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});

export const bankQuerySchema = z.object({
  bankAccountId: z.string().uuid().optional(),
  reconciled: z.enum(["yes", "no"]).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  search: z.string().max(100).optional(),
});

export type InvoiceLineInput = z.output<typeof invoiceLineSchema>;
export type InvoiceInput = z.output<typeof invoiceSchema>;
export type InvoicePaymentInput = z.output<typeof invoicePaymentSchema>;
export type BankAccountInput = z.output<typeof bankAccountSchema>;
export type BankTransactionInput = z.output<typeof bankTransactionSchema>;
export type InvoiceQuery = z.output<typeof invoiceQuerySchema>;
export type BankQuery = z.output<typeof bankQuerySchema>;
export type CashFlowActivity = (typeof CASH_FLOW_ACTIVITIES)[number];
