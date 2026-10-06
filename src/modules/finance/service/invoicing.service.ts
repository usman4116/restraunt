import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { audit } from "@/lib/audit";
import { tenantWhere, type TenantContext } from "@/lib/auth/context";
import type { Prisma, InvoiceStatus } from "@/generated/prisma/client";
import type {
  InvoiceInput,
  InvoiceLineInput,
  InvoicePaymentInput,
  BankAccountInput,
  BankTransactionInput,
  InvoiceQuery,
  BankQuery,
  CashFlowActivity,
} from "../dto/invoicing.dto";

/** Parse "YYYY-MM-DD" as UTC midnight, matching Prisma's @db.Date. */
function parseDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

const cents = (n: number) => Math.round(n * 100);

function defaultPeriod() {
  const now = new Date();
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

/** Inclusive "to" filters need the day after, since dates are midnight-anchored. */
function dayAfter(date: Date) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

// ─────────────────────────────── pure rules ───────────────────────────────

/** Line total including tax, rounded to cents once at the end. */
export function lineTotal(line: {
  quantity: number;
  unitPrice: number;
  taxRate: number;
}) {
  const net = line.quantity * line.unitPrice;
  return round2(net + net * (line.taxRate / 100));
}

/**
 * Invoice totals. Tax is summed per line rather than applied to the subtotal,
 * because lines can carry different rates (food vs. alcohol vs. service).
 */
export function invoiceTotals(lines: InvoiceLineInput[]) {
  let subtotal = 0;
  let taxAmount = 0;
  for (const line of lines) {
    const net = line.quantity * line.unitPrice;
    subtotal += net;
    taxAmount += net * (line.taxRate / 100);
  }
  return {
    subtotal: round2(subtotal),
    taxAmount: round2(taxAmount),
    totalAmount: round2(subtotal + taxAmount),
  };
}

export function amountDue(totalAmount: number, amountPaid: number) {
  return round2(Math.max(0, totalAmount - amountPaid));
}

/**
 * Status after a payment lands. Compared in cents so a rounding sliver can never
 * leave an invoice one hundredth short of PAID and stuck in the ageing report.
 */
export function statusAfterPayment(
  current: InvoiceStatus,
  totalAmount: number,
  amountPaid: number,
): InvoiceStatus {
  if (current === "DRAFT" || current === "VOID") return current;
  if (cents(amountPaid) >= cents(totalAmount)) return "PAID";
  if (amountPaid > 0) return "PARTIALLY_PAID";
  return current === "PARTIALLY_PAID" ? "ISSUED" : current;
}

/** An issued, not-fully-paid invoice past its due date is overdue. */
export function isOverdue(
  status: InvoiceStatus,
  dueDate: Date,
  asOf: Date,
  totalAmount: number,
  amountPaid: number,
) {
  if (status !== "ISSUED" && status !== "PARTIALLY_PAID" && status !== "OVERDUE") return false;
  if (cents(amountPaid) >= cents(totalAmount)) return false;
  return dueDate.getTime() < asOf.getTime();
}

/** Whole days a balance has been outstanding; never negative. */
export function daysOverdue(dueDate: Date, asOf: Date) {
  const ms = asOf.getTime() - dueDate.getTime();
  return ms <= 0 ? 0 : Math.floor(ms / 86_400_000);
}

export const AGEING_BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

export function ageingBucket(days: number): AgeingBucket {
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

/** Only a draft can be edited or deleted; only a draft can be issued. */
export function canEditInvoice(status: InvoiceStatus) {
  return status === "DRAFT";
}

export function canIssueInvoice(status: InvoiceStatus) {
  return status === "DRAFT";
}

/** A voided or fully-paid invoice takes no further payments. */
export function canPayInvoice(status: InvoiceStatus) {
  return status === "ISSUED" || status === "PARTIALLY_PAID" || status === "OVERDUE";
}

/** Voiding is reserved for issued documents with nothing collected yet. */
export function canVoidInvoice(status: InvoiceStatus, amountPaid: number) {
  if (status === "VOID" || status === "PAID") return false;
  return cents(amountPaid) === 0;
}

/** Sequential per-org, per-direction numbers: INV-000001 / BILL-000001. */
export function nextInvoiceNumber(prefix: string, lastNumber: string | null) {
  const last = lastNumber ? Number(lastNumber.replace(/\D/g, "")) : 0;
  return `${prefix}-${String(last + 1).padStart(6, "0")}`;
}

export function invoicePrefix(direction: "SALES" | "PURCHASE") {
  return direction === "SALES" ? "INV" : "BILL";
}

/**
 * Cash-flow classification. Restaurant cash is overwhelmingly operating, so the
 * mapping only pulls out the categories that genuinely are not.
 */
const INVESTING_CATEGORIES = new Set([
  "equipment",
  "fixtures",
  "renovation",
  "vehicle",
  "asset purchase",
  "asset sale",
  "deposit",
]);
const FINANCING_CATEGORIES = new Set([
  "loan",
  "loan repayment",
  "interest",
  "owner draw",
  "capital",
  "dividend",
  "lease principal",
]);

export function cashFlowActivity(category: string | null): CashFlowActivity {
  const key = (category ?? "").trim().toLowerCase();
  if (INVESTING_CATEGORIES.has(key)) return "INVESTING";
  if (FINANCING_CATEGORIES.has(key)) return "FINANCING";
  return "OPERATING";
}

/** Signed cash movement: inflows add, outflows subtract. */
export function signedAmount(direction: "INFLOW" | "OUTFLOW", amount: number) {
  return direction === "INFLOW" ? round2(amount) : round2(-amount);
}

/** Running balance from an opening figure plus a chronological ledger. */
export function runningBalance(
  openingBalance: number,
  rows: { direction: "INFLOW" | "OUTFLOW"; amount: number }[],
) {
  return round2(
    rows.reduce((sum, r) => sum + signedAmount(r.direction, r.amount), openingBalance),
  );
}

// ─────────────────────────────── service ───────────────────────────────

export const invoicingService = {
  async invoices(ctx: TenantContext, query: InvoiceQuery) {
    const range =
      query.from && query.to
        ? { gte: parseDate(query.from), lt: dayAfter(parseDate(query.to)) }
        : undefined;

    const where: Prisma.InvoiceWhereInput = {
      ...tenantWhere(ctx),
      ...(query.direction ? { direction: query.direction } : {}),
      ...(query.invoiceStatus ? { invoiceStatus: query.invoiceStatus } : {}),
      ...(range ? { issueDate: range } : {}),
      ...(query.search
        ? {
            OR: [
              { invoiceNumber: { contains: query.search, mode: "insensitive" } },
              { partyName: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: [{ issueDate: "desc" }, { invoiceNumber: "desc" }],
      take: 200,
      include: { lines: true, payments: { orderBy: { paidAt: "desc" } } },
    });

    const asOf = new Date();

    return invoices.map((inv) => {
      const total = Number(inv.totalAmount);
      const paid = Number(inv.amountPaid);
      const overdue = isOverdue(inv.invoiceStatus, inv.dueDate, asOf, total, paid);
      return {
        id: inv.id,
        direction: inv.direction,
        invoiceNumber: inv.invoiceNumber,
        // Overdue is derived on read, not stored: a stored flag would need a cron
        // job to stay true and would be wrong between runs.
        invoiceStatus: overdue && inv.invoiceStatus !== "OVERDUE" ? "OVERDUE" : inv.invoiceStatus,
        partyName: inv.partyName,
        customerId: inv.customerId,
        supplierId: inv.supplierId,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        subtotal: Number(inv.subtotal),
        taxAmount: Number(inv.taxAmount),
        totalAmount: total,
        amountPaid: paid,
        amountDue: amountDue(total, paid),
        daysOverdue: overdue ? daysOverdue(inv.dueDate, asOf) : 0,
        notes: inv.notes,
        terms: inv.terms,
        lines: inv.lines.map((l) => ({
          id: l.id,
          description: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          taxRate: Number(l.taxRate),
          lineTotal: Number(l.lineTotal),
          accountId: l.accountId,
        })),
        payments: inv.payments.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          paidAt: p.paidAt,
          method: p.method,
          reference: p.reference,
          bankAccountId: p.bankAccountId,
        })),
      };
    });
  },

  /** Receivable and payable ageing in one pass over the open documents. */
  async ageing(ctx: TenantContext) {
    const open = await prisma.invoice.findMany({
      where: {
        ...tenantWhere(ctx),
        invoiceStatus: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
      },
      select: {
        id: true,
        direction: true,
        invoiceNumber: true,
        partyName: true,
        dueDate: true,
        totalAmount: true,
        amountPaid: true,
      },
      orderBy: { dueDate: "asc" },
    });

    const asOf = new Date();
    const empty = () =>
      Object.fromEntries(AGEING_BUCKETS.map((b) => [b, 0])) as Record<AgeingBucket, number>;

    const receivable = empty();
    const payable = empty();
    const rows: {
      id: string;
      direction: string;
      invoiceNumber: string;
      partyName: string;
      dueDate: Date;
      amountDue: number;
      daysOverdue: number;
      bucket: AgeingBucket;
    }[] = [];

    for (const inv of open) {
      const due = amountDue(Number(inv.totalAmount), Number(inv.amountPaid));
      if (due <= 0) continue;
      const days = daysOverdue(inv.dueDate, asOf);
      const bucket = ageingBucket(days);
      const target = inv.direction === "SALES" ? receivable : payable;
      target[bucket] = round2(target[bucket] + due);
      rows.push({
        id: inv.id,
        direction: inv.direction,
        invoiceNumber: inv.invoiceNumber,
        partyName: inv.partyName,
        dueDate: inv.dueDate,
        amountDue: due,
        daysOverdue: days,
        bucket,
      });
    }

    const sum = (b: Record<AgeingBucket, number>) =>
      round2(Object.values(b).reduce((a, v) => a + v, 0));

    return {
      buckets: AGEING_BUCKETS,
      receivable,
      payable,
      totalReceivable: sum(receivable),
      totalPayable: sum(payable),
      rows: rows.sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 100),
    };
  },

  async bankAccounts(ctx: TenantContext) {
    const accounts = await prisma.bankAccount.findMany({
      where: tenantWhere(ctx),
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    });

    // One grouped query rather than a balance query per account.
    const movements = await prisma.bankTransaction.groupBy({
      by: ["bankAccountId", "direction"],
      where: { ...tenantWhere(ctx) },
      _sum: { amount: true },
    });

    const net = new Map<string, number>();
    for (const m of movements) {
      const delta = signedAmount(m.direction, Number(m._sum.amount ?? 0));
      net.set(m.bankAccountId, round2((net.get(m.bankAccountId) ?? 0) + delta));
    }

    const unreconciled = await prisma.bankTransaction.groupBy({
      by: ["bankAccountId"],
      where: { ...tenantWhere(ctx), reconciledAt: null },
      _count: { _all: true },
    });
    const pending = new Map(unreconciled.map((u) => [u.bankAccountId, u._count._all]));

    return accounts.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      bankName: a.bankName,
      accountNumber: a.accountNumber,
      iban: a.iban,
      currency: a.currency,
      openingBalance: Number(a.openingBalance),
      glAccountId: a.glAccountId,
      isPrimary: a.isPrimary,
      balance: round2(Number(a.openingBalance) + (net.get(a.id) ?? 0)),
      unreconciledCount: pending.get(a.id) ?? 0,
    }));
  },

  async bankTransactions(ctx: TenantContext, query: BankQuery) {
    const range =
      query.from && query.to
        ? { gte: parseDate(query.from), lt: dayAfter(parseDate(query.to)) }
        : undefined;

    const transactions = await prisma.bankTransaction.findMany({
      where: {
        ...tenantWhere(ctx),
        ...(query.bankAccountId ? { bankAccountId: query.bankAccountId } : {}),
        ...(query.reconciled === "yes" ? { reconciledAt: { not: null } } : {}),
        ...(query.reconciled === "no" ? { reconciledAt: null } : {}),
        ...(range ? { txnDate: range } : {}),
        ...(query.search
          ? {
              OR: [
                { description: { contains: query.search, mode: "insensitive" } },
                { counterparty: { contains: query.search, mode: "insensitive" } },
                { reference: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ txnDate: "desc" }, { createdAt: "desc" }],
      take: 300,
      include: { bankAccount: { select: { name: true } } },
    });

    return transactions.map((t) => ({
      id: t.id,
      bankAccountId: t.bankAccountId,
      bankAccountName: t.bankAccount.name,
      direction: t.direction,
      amount: Number(t.amount),
      signedAmount: signedAmount(t.direction, Number(t.amount)),
      txnDate: t.txnDate,
      description: t.description,
      category: t.category,
      reference: t.reference,
      counterparty: t.counterparty,
      reconciledAt: t.reconciledAt,
      invoiceId: t.invoiceId,
      activity: cashFlowActivity(t.category),
    }));
  },

  /**
   * Cash-flow statement built from the bank ledger (direct method). The opening
   * balance is every account's opening figure plus all movement *before* the
   * window, so the closing figure reconciles with the account balances on screen.
   */
  async cashFlow(ctx: TenantContext, from?: string, to?: string) {
    const { start, end } =
      from && to ? { start: parseDate(from), end: dayAfter(parseDate(to)) } : defaultPeriod();

    const [accounts, priorMovements, rows] = await Promise.all([
      prisma.bankAccount.findMany({
        where: tenantWhere(ctx),
        select: { openingBalance: true },
      }),
      prisma.bankTransaction.groupBy({
        by: ["direction"],
        where: { ...tenantWhere(ctx), txnDate: { lt: start } },
        _sum: { amount: true },
      }),
      prisma.bankTransaction.findMany({
        where: { ...tenantWhere(ctx), txnDate: { gte: start, lt: end } },
        select: { direction: true, amount: true, category: true },
      }),
    ]);

    const openingAccounts = round2(
      accounts.reduce((sum, a) => sum + Number(a.openingBalance), 0),
    );
    const openingMovement = round2(
      priorMovements.reduce(
        (sum, m) => sum + signedAmount(m.direction, Number(m._sum.amount ?? 0)),
        0,
      ),
    );
    const openingBalance = round2(openingAccounts + openingMovement);

    const blank = () => ({ inflow: 0, outflow: 0, net: 0 });
    const activities: Record<CashFlowActivity, ReturnType<typeof blank>> = {
      OPERATING: blank(),
      INVESTING: blank(),
      FINANCING: blank(),
    };
    const categories = new Map<string, { category: string; inflow: number; outflow: number }>();

    for (const row of rows) {
      const amount = Number(row.amount);
      const activity = cashFlowActivity(row.category);
      const bucket = activities[activity];
      if (row.direction === "INFLOW") bucket.inflow = round2(bucket.inflow + amount);
      else bucket.outflow = round2(bucket.outflow + amount);

      const key = row.category?.trim() || "Uncategorised";
      const entry = categories.get(key) ?? { category: key, inflow: 0, outflow: 0 };
      if (row.direction === "INFLOW") entry.inflow = round2(entry.inflow + amount);
      else entry.outflow = round2(entry.outflow + amount);
      categories.set(key, entry);
    }

    for (const bucket of Object.values(activities)) {
      bucket.net = round2(bucket.inflow - bucket.outflow);
    }

    const totalInflow = round2(
      Object.values(activities).reduce((sum, a) => sum + a.inflow, 0),
    );
    const totalOutflow = round2(
      Object.values(activities).reduce((sum, a) => sum + a.outflow, 0),
    );
    const netChange = round2(totalInflow - totalOutflow);

    return {
      openingBalance,
      closingBalance: round2(openingBalance + netChange),
      operating: activities.OPERATING,
      investing: activities.INVESTING,
      financing: activities.FINANCING,
      totalInflow,
      totalOutflow,
      netChange,
      categories: [...categories.values()]
        .map((c) => ({ ...c, net: round2(c.inflow - c.outflow) }))
        .sort((a, b) => Math.abs(b.net) - Math.abs(a.net)),
    };
  },

  async invoiceSummary(ctx: TenantContext) {
    const [sales, purchases, overdue] = await Promise.all([
      prisma.invoice.aggregate({
        where: {
          ...tenantWhere(ctx),
          direction: "SALES",
          invoiceStatus: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
        },
        _sum: { totalAmount: true, amountPaid: true },
        _count: { _all: true },
      }),
      prisma.invoice.aggregate({
        where: {
          ...tenantWhere(ctx),
          direction: "PURCHASE",
          invoiceStatus: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
        },
        _sum: { totalAmount: true, amountPaid: true },
        _count: { _all: true },
      }),
      prisma.invoice.count({
        where: {
          ...tenantWhere(ctx),
          invoiceStatus: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
          dueDate: { lt: new Date() },
        },
      }),
    ]);

    const due = (agg: typeof sales) =>
      amountDue(Number(agg._sum.totalAmount ?? 0), Number(agg._sum.amountPaid ?? 0));

    return {
      openReceivable: due(sales),
      openPayable: due(purchases),
      openSalesCount: sales._count._all,
      openPurchaseCount: purchases._count._all,
      overdueCount: overdue,
    };
  },

  async createInvoice(ctx: TenantContext, input: InvoiceInput) {
    const prefix = invoicePrefix(input.direction);
    const last = await prisma.invoice.findFirst({
      where: { organizationId: ctx.organizationId, direction: input.direction },
      orderBy: { invoiceNumber: "desc" },
      select: { invoiceNumber: true },
    });
    const invoiceNumber = nextInvoiceNumber(prefix, last?.invoiceNumber ?? null);
    const totals = invoiceTotals(input.lines);

    const invoice = await prisma.invoice.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: ctx.branchId || null,
        direction: input.direction,
        invoiceNumber,
        invoiceStatus: "DRAFT",
        customerId: input.customerId || null,
        supplierId: input.supplierId || null,
        partyName: input.partyName,
        issueDate: parseDate(input.issueDate),
        dueDate: parseDate(input.dueDate),
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        notes: input.notes || null,
        terms: input.terms || null,
        referenceType: "manual",
        createdById: ctx.userId,
        lines: {
          create: input.lines.map((line) => ({
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxRate: line.taxRate,
            lineTotal: lineTotal(line),
            accountId: line.accountId || null,
          })),
        },
      },
    });

    await audit(ctx, {
      action: "invoice.create",
      entityType: "Invoice",
      entityId: invoice.id,
      after: { invoiceNumber, direction: input.direction, totalAmount: totals.totalAmount },
    });

    return invoice;
  },

  async updateInvoice(ctx: TenantContext, id: string, input: InvoiceInput) {
    const invoice = await prisma.invoice.findFirst({ where: { id, ...tenantWhere(ctx) } });
    if (!invoice) throw new DomainError("NOT_FOUND", "Invoice not found");
    if (!canEditInvoice(invoice.invoiceStatus))
      throw new DomainError("CONFLICT", "Only draft invoices can be edited");
    if (invoice.direction !== input.direction)
      throw new DomainError("VALIDATION_ERROR", "An invoice's direction cannot change");

    const totals = invoiceTotals(input.lines);

    await prisma.$transaction(async (tx) => {
      // Replace the lines wholesale: reconciling an edited set row-by-row buys
      // nothing while the invoice is still a draft with no payments against it.
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.invoice.update({
        where: { id },
        data: {
          customerId: input.customerId || null,
          supplierId: input.supplierId || null,
          partyName: input.partyName,
          issueDate: parseDate(input.issueDate),
          dueDate: parseDate(input.dueDate),
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          notes: input.notes || null,
          terms: input.terms || null,
          lines: {
            create: input.lines.map((line) => ({
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              taxRate: line.taxRate,
              lineTotal: lineTotal(line),
              accountId: line.accountId || null,
            })),
          },
        },
      });
    });

    await audit(ctx, {
      action: "invoice.update",
      entityType: "Invoice",
      entityId: id,
      before: { totalAmount: Number(invoice.totalAmount) },
      after: { totalAmount: totals.totalAmount },
    });
  },

  /** Issue a draft: it becomes immutable and starts ageing. */
  async issueInvoice(ctx: TenantContext, id: string) {
    const invoice = await prisma.invoice.findFirst({ where: { id, ...tenantWhere(ctx) } });
    if (!invoice) throw new DomainError("NOT_FOUND", "Invoice not found");
    if (!canIssueInvoice(invoice.invoiceStatus))
      throw new DomainError("CONFLICT", "Only draft invoices can be issued");
    if (Number(invoice.totalAmount) <= 0)
      throw new DomainError("VALIDATION_ERROR", "An invoice must total more than zero");

    await prisma.invoice.update({
      where: { id },
      data: { invoiceStatus: "ISSUED", issuedAt: new Date() },
    });

    await audit(ctx, {
      action: "invoice.issue",
      entityType: "Invoice",
      entityId: id,
      before: { invoiceStatus: invoice.invoiceStatus },
      after: { invoiceStatus: "ISSUED" },
    });
  },

  async voidInvoice(ctx: TenantContext, id: string) {
    const invoice = await prisma.invoice.findFirst({ where: { id, ...tenantWhere(ctx) } });
    if (!invoice) throw new DomainError("NOT_FOUND", "Invoice not found");
    if (!canVoidInvoice(invoice.invoiceStatus, Number(invoice.amountPaid)))
      throw new DomainError(
        "CONFLICT",
        "Only an unpaid, non-voided invoice can be voided — refund the payments first",
      );

    await prisma.invoice.update({
      where: { id },
      data: { invoiceStatus: "VOID", voidedAt: new Date() },
    });

    await audit(ctx, {
      action: "invoice.void",
      entityType: "Invoice",
      entityId: id,
      before: { invoiceStatus: invoice.invoiceStatus },
      after: { invoiceStatus: "VOID" },
    });
  },

  async removeInvoice(ctx: TenantContext, id: string) {
    const invoice = await prisma.invoice.findFirst({ where: { id, ...tenantWhere(ctx) } });
    if (!invoice) throw new DomainError("NOT_FOUND", "Invoice not found");
    if (!canEditInvoice(invoice.invoiceStatus))
      throw new DomainError("CONFLICT", "Only draft invoices can be deleted — void issued ones");

    await prisma.invoice.update({ where: { id }, data: { deletedAt: new Date() } });

    await audit(ctx, {
      action: "invoice.delete",
      entityType: "Invoice",
      entityId: id,
      before: { invoiceNumber: invoice.invoiceNumber },
    });
  },

  /**
   * Record a payment against an invoice. The invoice's `amountPaid` and status,
   * plus the mirroring bank transaction, all move inside one transaction so a
   * partial failure cannot leave the cash ledger disagreeing with the invoice.
   */
  async payInvoice(ctx: TenantContext, input: InvoicePaymentInput) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: input.invoiceId, ...tenantWhere(ctx) },
    });
    if (!invoice) throw new DomainError("NOT_FOUND", "Invoice not found");
    if (!canPayInvoice(invoice.invoiceStatus))
      throw new DomainError("CONFLICT", "This invoice is not open for payment");

    const total = Number(invoice.totalAmount);
    const alreadyPaid = Number(invoice.amountPaid);
    const outstanding = amountDue(total, alreadyPaid);
    if (cents(input.amount) > cents(outstanding))
      throw new DomainError(
        "VALIDATION_ERROR",
        `Payment exceeds the ${outstanding.toFixed(2)} still outstanding`,
        { amount: "More than the amount due" },
      );

    if (input.bankAccountId) {
      const account = await prisma.bankAccount.findFirst({
        where: { id: input.bankAccountId, ...tenantWhere(ctx) },
      });
      if (!account) throw new DomainError("NOT_FOUND", "Bank account not found");
    }

    const newPaid = round2(alreadyPaid + input.amount);
    const nextStatus = statusAfterPayment(invoice.invoiceStatus, total, newPaid);
    const paidAt = parseDate(input.paidAt);

    await prisma.$transaction(async (tx) => {
      await tx.invoicePayment.create({
        data: {
          invoiceId: invoice.id,
          bankAccountId: input.bankAccountId || null,
          amount: input.amount,
          paidAt,
          method: input.method,
          reference: input.reference || null,
          notes: input.notes || null,
          createdById: ctx.userId,
        },
      });

      await tx.invoice.update({
        where: { id: invoice.id },
        data: { amountPaid: newPaid, invoiceStatus: nextStatus },
      });

      // A settled sales invoice brings cash in; a settled bill sends it out.
      if (input.bankAccountId) {
        await tx.bankTransaction.create({
          data: {
            organizationId: ctx.organizationId,
            bankAccountId: input.bankAccountId,
            direction: invoice.direction === "SALES" ? "INFLOW" : "OUTFLOW",
            amount: input.amount,
            txnDate: paidAt,
            description: `${invoice.invoiceNumber} — ${invoice.partyName}`,
            category: invoice.direction === "SALES" ? "Sales" : "Supplier payment",
            reference: input.reference || invoice.invoiceNumber,
            counterparty: invoice.partyName,
            invoiceId: invoice.id,
            createdById: ctx.userId,
          },
        });
      }
    });

    await audit(ctx, {
      action: "invoice.pay",
      entityType: "Invoice",
      entityId: invoice.id,
      before: { amountPaid: alreadyPaid, invoiceStatus: invoice.invoiceStatus },
      after: { amountPaid: newPaid, invoiceStatus: nextStatus },
    });
  },

  async createBankAccount(ctx: TenantContext, input: BankAccountInput) {
    const duplicate = await prisma.bankAccount.findFirst({
      where: { organizationId: ctx.organizationId, name: input.name, deletedAt: null },
    });
    if (duplicate)
      throw new DomainError("CONFLICT", "An account with that name already exists", {
        name: "Already in use",
      });

    const account = await prisma.$transaction(async (tx) => {
      // Exactly one primary account: promoting a new one demotes the old.
      if (input.isPrimary) {
        await tx.bankAccount.updateMany({
          where: { organizationId: ctx.organizationId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.bankAccount.create({
        data: {
          organizationId: ctx.organizationId,
          branchId: ctx.branchId || null,
          name: input.name,
          kind: input.kind,
          bankName: input.bankName || null,
          accountNumber: input.accountNumber || null,
          iban: input.iban || null,
          currency: input.currency,
          openingBalance: input.openingBalance,
          glAccountId: input.glAccountId || null,
          isPrimary: input.isPrimary,
          createdById: ctx.userId,
        },
      });
    });

    await audit(ctx, {
      action: "bankAccount.create",
      entityType: "BankAccount",
      entityId: account.id,
      after: { name: account.name, kind: account.kind },
    });

    return account;
  },

  async updateBankAccount(ctx: TenantContext, id: string, input: BankAccountInput) {
    const account = await prisma.bankAccount.findFirst({ where: { id, ...tenantWhere(ctx) } });
    if (!account) throw new DomainError("NOT_FOUND", "Bank account not found");

    if (input.name !== account.name) {
      const duplicate = await prisma.bankAccount.findFirst({
        where: {
          organizationId: ctx.organizationId,
          name: input.name,
          deletedAt: null,
          id: { not: id },
        },
      });
      if (duplicate)
        throw new DomainError("CONFLICT", "An account with that name already exists", {
          name: "Already in use",
        });
    }

    await prisma.$transaction(async (tx) => {
      if (input.isPrimary && !account.isPrimary) {
        await tx.bankAccount.updateMany({
          where: { organizationId: ctx.organizationId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      await tx.bankAccount.update({
        where: { id },
        data: {
          name: input.name,
          kind: input.kind,
          bankName: input.bankName || null,
          accountNumber: input.accountNumber || null,
          iban: input.iban || null,
          currency: input.currency,
          openingBalance: input.openingBalance,
          glAccountId: input.glAccountId || null,
          isPrimary: input.isPrimary,
        },
      });
    });

    await audit(ctx, {
      action: "bankAccount.update",
      entityType: "BankAccount",
      entityId: id,
      before: { name: account.name, openingBalance: Number(account.openingBalance) },
      after: { name: input.name, openingBalance: input.openingBalance },
    });
  },

  async removeBankAccount(ctx: TenantContext, id: string) {
    const account = await prisma.bankAccount.findFirst({ where: { id, ...tenantWhere(ctx) } });
    if (!account) throw new DomainError("NOT_FOUND", "Bank account not found");

    const movements = await prisma.bankTransaction.count({
      where: { bankAccountId: id, deletedAt: null },
    });
    if (movements > 0)
      throw new DomainError(
        "CONFLICT",
        "An account with transactions cannot be removed — deactivate it instead",
      );

    await prisma.bankAccount.update({ where: { id }, data: { deletedAt: new Date() } });

    await audit(ctx, {
      action: "bankAccount.delete",
      entityType: "BankAccount",
      entityId: id,
      before: { name: account.name },
    });
  },

  async createBankTransaction(ctx: TenantContext, input: BankTransactionInput) {
    const account = await prisma.bankAccount.findFirst({
      where: { id: input.bankAccountId, ...tenantWhere(ctx) },
    });
    if (!account) throw new DomainError("NOT_FOUND", "Bank account not found");

    const txn = await prisma.bankTransaction.create({
      data: {
        organizationId: ctx.organizationId,
        bankAccountId: input.bankAccountId,
        direction: input.direction,
        amount: input.amount,
        txnDate: parseDate(input.txnDate),
        description: input.description,
        category: input.category || null,
        reference: input.reference || null,
        counterparty: input.counterparty || null,
        createdById: ctx.userId,
      },
    });

    await audit(ctx, {
      action: "bankTransaction.create",
      entityType: "BankTransaction",
      entityId: txn.id,
      after: { direction: txn.direction, amount: Number(txn.amount), account: account.name },
    });

    return txn;
  },

  /** Toggle reconciliation. Idempotent in both directions. */
  async reconcileBankTransaction(ctx: TenantContext, id: string, reconciled: boolean) {
    const txn = await prisma.bankTransaction.findFirst({ where: { id, ...tenantWhere(ctx) } });
    if (!txn) throw new DomainError("NOT_FOUND", "Transaction not found");

    await prisma.bankTransaction.update({
      where: { id },
      data: { reconciledAt: reconciled ? new Date() : null },
    });

    await audit(ctx, {
      action: reconciled ? "bankTransaction.reconcile" : "bankTransaction.unreconcile",
      entityType: "BankTransaction",
      entityId: id,
      after: { reconciled },
    });
  },

  async removeBankTransaction(ctx: TenantContext, id: string) {
    const txn = await prisma.bankTransaction.findFirst({ where: { id, ...tenantWhere(ctx) } });
    if (!txn) throw new DomainError("NOT_FOUND", "Transaction not found");
    if (txn.invoiceId)
      throw new DomainError(
        "CONFLICT",
        "This row settles an invoice — reverse the payment instead of deleting the cash movement",
      );

    await prisma.bankTransaction.update({ where: { id }, data: { deletedAt: new Date() } });

    await audit(ctx, {
      action: "bankTransaction.delete",
      entityType: "BankTransaction",
      entityId: id,
      before: { description: txn.description, amount: Number(txn.amount) },
    });
  },
};

