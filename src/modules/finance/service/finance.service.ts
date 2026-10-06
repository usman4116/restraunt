import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { audit } from "@/lib/audit";
import { tenantWhere, type TenantContext } from "@/lib/auth/context";
import type { Prisma, JournalStatus } from "@/generated/prisma/client";
import type {
  AccountInput,
  JournalEntryInput,
  JournalPostInput,
  ExpenseInput,
  FinanceQuery,
} from "../dto/finance.dto";
import { DEBIT_NORMAL_TYPES } from "../dto/finance.dto";

/** Parse "YYYY-MM-DD" as a UTC midnight date, matching Prisma's @db.Date. */
function parseDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Truncate a timestamp to UTC midnight for @db.Date columns. */
function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** `referenceType` marker linking a journal entry back to the order that made it. */
export const ORDER_REFERENCE_TYPE = "order";

/** Chart-of-accounts codes the POS posts against. Seeded in prisma/seed.ts. */
export const POS_ACCOUNT_CODES = {
  cash: "1000",
  revenue: "4000",
  taxPayable: "2200",
  tipPayable: "2210",
} as const;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** The default date range when the user supplies no filter. */
function defaultPeriod() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

/**
 * Double-entry invariant. Totals are compared in whole cents because
 * 0.1 + 0.2 !== 0.3 in binary floating point and a ledger cannot tolerate that.
 */
export function isBalanced(lines: { debit: number; credit: number }[]) {
  const cents = (n: number) => Math.round(n * 100);
  const debit = lines.reduce((sum, l) => sum + cents(l.debit), 0);
  const credit = lines.reduce((sum, l) => sum + cents(l.credit), 0);
  return debit === credit && debit > 0;
}

/**
 * Signed balance in the account's natural direction: assets and expenses grow
 * on debit, everything else on credit. Keeping the sign convention here means
 * the P&L and balance sheet never have to remember which way an account leans.
 */
export function accountBalance(
  type: string,
  debit: number,
  credit: number,
) {
  const raw = DEBIT_NORMAL_TYPES.includes(type as (typeof DEBIT_NORMAL_TYPES)[number])
    ? debit - credit
    : credit - debit;
  return round2(raw);
}

/** DRAFT is the only editable state; POSTED can only be reversed. */
export function canPostJournal(status: JournalStatus) {
  return status === "DRAFT";
}

export function canReverseJournal(status: JournalStatus) {
  return status === "POSTED";
}

export function canEditJournal(status: JournalStatus) {
  return status === "DRAFT";
}

/** Sequential per-org entry numbers: JE-000001, JE-000002, … */
export function nextEntryNumber(lastNumber: string | null) {
  const last = lastNumber ? Number(lastNumber.replace(/\D/g, "")) : 0;
  return `JE-${String(last + 1).padStart(6, "0")}`;
}

/** Net profit for a period; expenses include COGS. */
export function netProfit(revenue: number, expenses: number) {
  return round2(revenue - expenses);
}

/** Margin as a percentage, guarding the zero-revenue case. */
export function profitMargin(revenue: number, profit: number) {
  if (revenue <= 0) return 0;
  return Math.round((profit / revenue) * 1000) / 10;
}

/** Accounting equation check: assets must equal liabilities plus equity. */
export function balanceSheetBalances(assets: number, liabilities: number, equity: number) {
  return Math.round(assets * 100) === Math.round((liabilities + equity) * 100);
}

export const financeService = {
  async accounts(ctx: TenantContext, query: FinanceQuery) {
    const where: Prisma.AccountWhereInput = {
      ...tenantWhere(ctx),
      ...(query.accountType ? { type: query.accountType } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { name: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const accounts = await prisma.account.findMany({
      where,
      orderBy: [{ type: "asc" }, { code: "asc" }],
    });

    return accounts.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      parentId: a.parentId,
      isSystem: a.isSystem,
    }));
  },

  async journalEntries(ctx: TenantContext, query: FinanceQuery) {
    const { start, end } = query.from && query.to
      ? { start: parseDate(query.from), end: parseDate(query.to) }
      : defaultPeriod();

    const where: Prisma.JournalEntryWhereInput = {
      ...tenantWhere(ctx),
      entryDate: { gte: start, lt: end },
      ...(query.journalStatus ? { journalStatus: query.journalStatus } : {}),
    };

    const entries = await prisma.journalEntry.findMany({
      where,
      orderBy: [{ entryDate: "desc" }, { entryNumber: "desc" }],
      take: 200,
      include: { lines: { include: { account: { select: { code: true, name: true } } } } },
    });

    return entries.map((e) => {
      const debit = e.lines.reduce((sum, l) => sum + Number(l.debit), 0);
      const credit = e.lines.reduce((sum, l) => sum + Number(l.credit), 0);
      return {
        id: e.id,
        entryNumber: e.entryNumber,
        entryDate: e.entryDate,
        memo: e.memo,
        journalStatus: e.journalStatus,
        referenceType: e.referenceType,
        debitTotal: round2(debit),
        creditTotal: round2(credit),
        postedAt: e.postedAt,
        lines: e.lines.map((l) => ({
          id: l.id,
          accountCode: l.account.code,
          accountName: l.account.name,
          debit: Number(l.debit),
          credit: Number(l.credit),
          memo: l.memo,
        })),
      };
    });
  },

  async expenses(ctx: TenantContext, query: FinanceQuery) {
    const { start, end } = query.from && query.to
      ? { start: parseDate(query.from), end: parseDate(query.to) }
      : defaultPeriod();

    const expenses = await prisma.expense.findMany({
      where: { ...tenantWhere(ctx), expenseDate: { gte: start, lt: end } },
      orderBy: [{ expenseDate: "desc" }],
      take: 200,
    });

    return expenses.map((e) => ({
      id: e.id,
      category: e.category,
      description: e.description,
      amount: Number(e.amount),
      taxAmount: Number(e.taxAmount),
      expenseDate: e.expenseDate,
      vendorName: e.vendorName,
      receiptUrl: e.receiptUrl,
      accountId: e.accountId,
    }));
  },

  async summary(ctx: TenantContext, from?: string, to?: string) {
    const { start, end } = from && to
      ? { start: parseDate(from), end: parseDate(to) }
      : defaultPeriod();

    const [draftEntries, expenses, revenue, cogs] = await Promise.all([
      prisma.journalEntry.count({
        where: { ...tenantWhere(ctx), journalStatus: "DRAFT" },
      }),
      prisma.expense.aggregate({
        where: { ...tenantWhere(ctx), expenseDate: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      // Revenue = credit - debit on REVENUE accounts
      prisma.journalLine.aggregate({
        where: {
          entry: {
            ...tenantWhere(ctx),
            entryDate: { gte: start, lt: end },
            journalStatus: "POSTED",
          },
          account: { type: "REVENUE" },
        },
        _sum: { credit: true, debit: true },
      }),
      // COGS = debit - credit on expense accounts with "COGS" in name
      prisma.journalLine.aggregate({
        where: {
          entry: {
            ...tenantWhere(ctx),
            entryDate: { gte: start, lt: end },
            journalStatus: "POSTED",
          },
          account: { type: "EXPENSE", name: { contains: "COGS", mode: "insensitive" } },
        },
        _sum: { debit: true, credit: true },
      }),
    ]);

    const revenueNet = Number(revenue._sum.credit ?? 0) - Number(revenue._sum.debit ?? 0);
    const cogsNet = Number(cogs._sum.debit ?? 0) - Number(cogs._sum.credit ?? 0);

    return {
      draftEntries,
      totalExpenses: Number(expenses._sum.amount ?? 0),
      revenue: round2(revenueNet),
      cogs: round2(cogsNet),
      grossProfit: round2(revenueNet - cogsNet),
    };
  },

  /**
   * Trial balance: every account's posted debit and credit totals for the period,
   * plus its signed balance. P&L and balance sheet are both slices of this.
   */
  async trialBalance(ctx: TenantContext, from?: string, to?: string) {
    const { start, end } = from && to
      ? { start: parseDate(from), end: parseDate(to) }
      : defaultPeriod();

    const [accounts, grouped] = await Promise.all([
      prisma.account.findMany({
        where: tenantWhere(ctx),
        orderBy: [{ type: "asc" }, { code: "asc" }],
      }),
      prisma.journalLine.groupBy({
        by: ["accountId"],
        where: {
          entry: {
            ...tenantWhere(ctx),
            entryDate: { gte: start, lt: end },
            journalStatus: "POSTED",
          },
        },
        _sum: { debit: true, credit: true },
      }),
    ]);

    const totals = new Map(
      grouped.map((g) => [
        g.accountId,
        { debit: Number(g._sum.debit ?? 0), credit: Number(g._sum.credit ?? 0) },
      ]),
    );

    return accounts.map((a) => {
      const t = totals.get(a.id) ?? { debit: 0, credit: 0 };
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        debit: round2(t.debit),
        credit: round2(t.credit),
        balance: accountBalance(a.type, t.debit, t.credit),
      };
    });
  },

  /** Profit & loss for a period, built from REVENUE and EXPENSE accounts. */
  async profitAndLoss(ctx: TenantContext, from?: string, to?: string) {
    const rows = await financeService.trialBalance(ctx, from, to);

    const revenueRows = rows.filter((r) => r.type === "REVENUE" && r.balance !== 0);
    const expenseRows = rows.filter((r) => r.type === "EXPENSE" && r.balance !== 0);

    const revenue = round2(revenueRows.reduce((sum, r) => sum + r.balance, 0));
    const expenses = round2(expenseRows.reduce((sum, r) => sum + r.balance, 0));
    const profit = netProfit(revenue, expenses);

    return {
      revenueRows,
      expenseRows,
      revenue,
      expenses,
      netProfit: profit,
      margin: profitMargin(revenue, profit),
    };
  },

  /**
   * Balance sheet as of the period end. Retained earnings for the period are
   * folded into equity so the accounting equation actually holds — without it
   * the statement would be out of balance by exactly the period's profit.
   */
  async balanceSheet(ctx: TenantContext, from?: string, to?: string) {
    const [rows, pnl] = await Promise.all([
      financeService.trialBalance(ctx, from, to),
      financeService.profitAndLoss(ctx, from, to),
    ]);

    const assetRows = rows.filter((r) => r.type === "ASSET" && r.balance !== 0);
    const liabilityRows = rows.filter((r) => r.type === "LIABILITY" && r.balance !== 0);
    const equityRows = rows.filter((r) => r.type === "EQUITY" && r.balance !== 0);

    const assets = round2(assetRows.reduce((sum, r) => sum + r.balance, 0));
    const liabilities = round2(liabilityRows.reduce((sum, r) => sum + r.balance, 0));
    const equityPosted = round2(equityRows.reduce((sum, r) => sum + r.balance, 0));
    const equity = round2(equityPosted + pnl.netProfit);

    return {
      assetRows,
      liabilityRows,
      equityRows,
      assets,
      liabilities,
      equityPosted,
      retainedEarnings: pnl.netProfit,
      equity,
      balances: balanceSheetBalances(assets, liabilities, equity),
    };
  },

  async createAccount(ctx: TenantContext, input: AccountInput) {
    const duplicate = await prisma.account.findFirst({
      where: { organizationId: ctx.organizationId, code: input.code, deletedAt: null },
    });
    if (duplicate) throw new DomainError("CONFLICT", "Account code already exists");

    if (input.parentId) {
      const parent = await prisma.account.findFirst({
        where: { id: input.parentId, ...tenantWhere(ctx) },
      });
      if (!parent) throw new DomainError("NOT_FOUND", "Parent account not found");
      if (parent.type !== input.type)
        throw new DomainError("VALIDATION_ERROR", "Parent and child must share the same type");
    }

    const account = await prisma.account.create({
      data: {
        organizationId: ctx.organizationId,
        code: input.code,
        name: input.name,
        type: input.type,
        parentId: input.parentId || null,
      },
    });

    await audit(ctx, {
      action: "account.create",
      entityType: "Account",
      entityId: account.id,
      after: { code: account.code, name: account.name, type: account.type },
    });

    return account;
  },

  async updateAccount(ctx: TenantContext, id: string, input: AccountInput) {
    const account = await prisma.account.findFirst({
      where: { id, ...tenantWhere(ctx) },
    });
    if (!account) throw new DomainError("NOT_FOUND", "Account not found");
    if (account.isSystem) throw new DomainError("FORBIDDEN", "System accounts cannot be edited");

    if (input.code !== account.code) {
      const duplicate = await prisma.account.findFirst({
        where: {
          organizationId: ctx.organizationId,
          code: input.code,
          deletedAt: null,
          id: { not: id },
        },
      });
      if (duplicate) throw new DomainError("CONFLICT", "Account code already taken");
    }

    await prisma.account.update({
      where: { id },
      data: {
        code: input.code,
        name: input.name,
        type: input.type,
        parentId: input.parentId || null,
      },
    });

    await audit(ctx, {
      action: "account.update",
      entityType: "Account",
      entityId: id,
      before: { code: account.code, name: account.name },
      after: { code: input.code, name: input.name },
    });
  },

  async removeAccount(ctx: TenantContext, id: string) {
    const account = await prisma.account.findFirst({
      where: { id, ...tenantWhere(ctx) },
    });
    if (!account) throw new DomainError("NOT_FOUND", "Account not found");
    if (account.isSystem)
      throw new DomainError("FORBIDDEN", "System accounts cannot be removed");

    const hasLines = await prisma.journalLine.count({ where: { accountId: id }, take: 1 });
    if (hasLines > 0)
      throw new DomainError(
        "CONFLICT",
        "An account with journal lines cannot be removed",
      );

    await prisma.account.update({ where: { id }, data: { deletedAt: new Date() } });

    await audit(ctx, {
      action: "account.delete",
      entityType: "Account",
      entityId: id,
      before: { code: account.code, name: account.name },
    });
  },

  async createJournalEntry(ctx: TenantContext, input: JournalEntryInput) {
    const entryDate = parseDate(input.entryDate);

    const last = await prisma.journalEntry.findFirst({
      where: { organizationId: ctx.organizationId },
      orderBy: { entryNumber: "desc" },
      select: { entryNumber: true },
    });
    const entryNumber = nextEntryNumber(last?.entryNumber ?? null);

    const entry = await prisma.journalEntry.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: ctx.branchId || null,
        entryNumber,
        entryDate,
        memo: input.memo || null,
        referenceType: input.referenceType || null,
        referenceId: input.referenceId ?? null,
        journalStatus: "DRAFT",
        lines: {
          create: input.lines.map((line) => ({
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
            memo: line.memo || null,
          })),
        },
      },
      include: { lines: true },
    });

    await audit(ctx, {
      action: "journal.create",
      entityType: "JournalEntry",
      entityId: entry.id,
      after: { entryNumber, memo: entry.memo, lineCount: entry.lines.length },
    });

    return entry;
  },

  async postJournal(ctx: TenantContext, input: JournalPostInput) {
    const entry = await prisma.journalEntry.findFirst({
      where: { id: input.journalEntryId, ...tenantWhere(ctx) },
      include: { lines: true },
    });
    if (!entry) throw new DomainError("NOT_FOUND", "Journal entry not found");
    if (!canPostJournal(entry.journalStatus))
      throw new DomainError("CONFLICT", "Only draft entries can be posted");

    if (!isBalanced(entry.lines.map((l) => ({ debit: Number(l.debit), credit: Number(l.credit) }))))
      throw new DomainError("VALIDATION_ERROR", "Debits and credits must balance");

    await prisma.journalEntry.update({
      where: { id: entry.id },
      data: {
        journalStatus: "POSTED",
        postedAt: new Date(),
        postedById: ctx.userId,
      },
    });

    await audit(ctx, {
      action: "journal.post",
      entityType: "JournalEntry",
      entityId: entry.id,
      before: { journalStatus: entry.journalStatus },
      after: { journalStatus: "POSTED" },
    });
  },

  async reverseJournal(ctx: TenantContext, journalEntryId: string) {
    const original = await prisma.journalEntry.findFirst({
      where: { id: journalEntryId, ...tenantWhere(ctx) },
      include: { lines: { include: { account: true } } },
    });
    if (!original) throw new DomainError("NOT_FOUND", "Journal entry not found");
    if (!canReverseJournal(original.journalStatus))
      throw new DomainError("CONFLICT", "Only posted entries can be reversed");

    const last = await prisma.journalEntry.findFirst({
      where: { organizationId: ctx.organizationId },
      orderBy: { entryNumber: "desc" },
      select: { entryNumber: true },
    });
    const reversingNumber = nextEntryNumber(last?.entryNumber ?? null);

    const reversing = await prisma.$transaction(async (tx) => {
      const rev = await tx.journalEntry.create({
        data: {
          organizationId: ctx.organizationId,
          branchId: ctx.branchId || null,
          entryNumber: reversingNumber,
          entryDate: new Date(),
          memo: `Reversing ${original.entryNumber}${original.memo ? ` — ${original.memo}` : ""}`,
          journalStatus: "POSTED",
          postedAt: new Date(),
          postedById: ctx.userId,
          lines: {
            create: original.lines.map((l) => ({
              accountId: l.accountId,
              debit: l.credit,
              credit: l.debit,
              memo: l.memo,
            })),
          },
        },
      });

      await tx.journalEntry.update({
        where: { id: original.id },
        data: { journalStatus: "REVERSED", reversedById: rev.id },
      });

      return rev;
    });

    await audit(ctx, {
      action: "journal.reverse",
      entityType: "JournalEntry",
      entityId: original.id,
      after: { reversingId: reversing.id, reversingNumber },
    });

    return reversing;
  },

  /**
   * Post a completed POS sale to the ledger so it reaches the P&L. Written as a
   * single POSTED entry rather than draft-then-post: a captured sale is not a
   * proposal, and the two-step path would leave revenue invisible until someone
   * clicked "post".
   *
   * Cash is debited for what was collected; revenue, tax and tips are credited
   * separately so tax and tips stay liabilities rather than inflating sales.
   * Returns null when the chart of accounts has no sales/cash pair to post to.
   */
  async postOrderRevenue(
    ctx: TenantContext,
    order: {
      id: string;
      orderNumber: string;
      branchId: string;
      placedAt: Date | null;
      subtotal: Prisma.Decimal | number;
      discountAmount: Prisma.Decimal | number;
      taxAmount: Prisma.Decimal | number;
      tipAmount: Prisma.Decimal | number;
      totalAmount: Prisma.Decimal | number;
    },
  ) {
    // One entry per order — a retried checkout must not double-count revenue.
    const existing = await prisma.journalEntry.findFirst({
      where: {
        organizationId: ctx.organizationId,
        referenceType: ORDER_REFERENCE_TYPE,
        referenceId: order.id,
      },
      select: { id: true },
    });
    if (existing) return null;

    const accounts = await prisma.account.findMany({
      where: {
        organizationId: ctx.organizationId,
        deletedAt: null,
        code: { in: Object.values(POS_ACCOUNT_CODES) },
      },
      select: { id: true, code: true },
    });
    const byCode = new Map(accounts.map((a) => [a.code, a.id]));
    const cashId = byCode.get(POS_ACCOUNT_CODES.cash);
    const revenueId = byCode.get(POS_ACCOUNT_CODES.revenue);
    if (!cashId || !revenueId) return null;

    const net = round2(Number(order.subtotal) - Number(order.discountAmount));
    const tax = round2(Number(order.taxAmount));
    const tip = round2(Number(order.tipAmount));
    const total = round2(Number(order.totalAmount));

    const lines: { accountId: string; debit: number; credit: number; memo: string }[] = [
      { accountId: cashId, debit: total, credit: 0, memo: `Order ${order.orderNumber}` },
      { accountId: revenueId, debit: 0, credit: net, memo: `Sales — ${order.orderNumber}` },
    ];

    const taxId = byCode.get(POS_ACCOUNT_CODES.taxPayable);
    if (tax > 0) {
      // Without a tax liability account the tax has nowhere to sit; folding it
      // into revenue would overstate sales, so credit it to revenue only as a
      // last resort and keep the entry balanced either way.
      lines.push({
        accountId: taxId ?? revenueId,
        debit: 0,
        credit: tax,
        memo: `Tax — ${order.orderNumber}`,
      });
    }

    const tipId = byCode.get(POS_ACCOUNT_CODES.tipPayable);
    if (tip > 0) {
      lines.push({
        accountId: tipId ?? revenueId,
        debit: 0,
        credit: tip,
        memo: `Tip — ${order.orderNumber}`,
      });
    }

    if (!isBalanced(lines)) {
      throw new DomainError(
        "INTERNAL",
        `Order ${order.orderNumber} does not balance against the ledger.`,
      );
    }

    const last = await prisma.journalEntry.findFirst({
      where: { organizationId: ctx.organizationId },
      orderBy: { entryNumber: "desc" },
      select: { entryNumber: true },
    });

    const entry = await prisma.journalEntry.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: order.branchId,
        entryNumber: nextEntryNumber(last?.entryNumber ?? null),
        entryDate: startOfUtcDay(order.placedAt ?? new Date()),
        memo: `POS order ${order.orderNumber}`,
        referenceType: ORDER_REFERENCE_TYPE,
        referenceId: order.id,
        journalStatus: "POSTED",
        postedAt: new Date(),
        postedById: ctx.userId,
        lines: { create: lines },
      },
      select: { id: true, entryNumber: true },
    });

    await audit(ctx, {
      action: "journal.post.order",
      entityType: "JournalEntry",
      entityId: entry.id,
      after: { entryNumber: entry.entryNumber, orderId: order.id, total },
    });

    return entry;
  },

  async removeJournalEntry(ctx: TenantContext, id: string) {
    const entry = await prisma.journalEntry.findFirst({
      where: { id, ...tenantWhere(ctx) },
    });
    if (!entry) throw new DomainError("NOT_FOUND", "Journal entry not found");
    if (!canEditJournal(entry.journalStatus))
      throw new DomainError("CONFLICT", "Only draft entries can be deleted");

    await prisma.journalEntry.update({ where: { id }, data: { deletedAt: new Date() } });

    await audit(ctx, {
      action: "journal.delete",
      entityType: "JournalEntry",
      entityId: id,
      before: { entryNumber: entry.entryNumber },
    });
  },

  async createExpense(ctx: TenantContext, input: ExpenseInput) {
    const expenseDate = parseDate(input.expenseDate);

    const expense = await prisma.expense.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: ctx.branchId || null,
        accountId: input.accountId || null,
        category: input.category,
        description: input.description || null,
        amount: input.amount,
        taxAmount: input.taxAmount,
        expenseDate,
        vendorName: input.vendorName || null,
        receiptUrl: input.receiptUrl || null,
        createdById: ctx.userId,
      },
    });

    await audit(ctx, {
      action: "expense.create",
      entityType: "Expense",
      entityId: expense.id,
      after: { category: expense.category, amount: Number(expense.amount) },
    });

    return expense;
  },

  async updateExpense(ctx: TenantContext, id: string, input: ExpenseInput) {
    const expense = await prisma.expense.findFirst({
      where: { id, ...tenantWhere(ctx) },
    });
    if (!expense) throw new DomainError("NOT_FOUND", "Expense not found");

    const expenseDate = parseDate(input.expenseDate);

    await prisma.expense.update({
      where: { id },
      data: {
        accountId: input.accountId || null,
        category: input.category,
        description: input.description || null,
        amount: input.amount,
        taxAmount: input.taxAmount,
        expenseDate,
        vendorName: input.vendorName || null,
        receiptUrl: input.receiptUrl || null,
      },
    });

    await audit(ctx, {
      action: "expense.update",
      entityType: "Expense",
      entityId: id,
      before: { amount: Number(expense.amount) },
      after: { amount: input.amount },
    });
  },

  async removeExpense(ctx: TenantContext, id: string) {
    const expense = await prisma.expense.findFirst({
      where: { id, ...tenantWhere(ctx) },
    });
    if (!expense) throw new DomainError("NOT_FOUND", "Expense not found");

    await prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });

    await audit(ctx, {
      action: "expense.delete",
      entityType: "Expense",
      entityId: id,
      before: { category: expense.category, amount: Number(expense.amount) },
    });
  },
};

