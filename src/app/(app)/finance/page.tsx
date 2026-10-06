import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { financeService } from "@/modules/finance/service/finance.service";
import { invoicingService } from "@/modules/finance/service/invoicing.service";
import { financeQuerySchema } from "@/modules/finance/dto/finance.dto";
import { invoiceQuerySchema, bankQuerySchema } from "@/modules/finance/dto/invoicing.dto";
import { FinanceManager } from "@/modules/finance/components/finance-manager";

export const metadata: Metadata = { title: "Finance" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const iso = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function defaultRange() {
  const now = new Date();
  return {
    from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 1)),
  };
}

export default async function FinancePage({ searchParams }: Props) {
  const ctx = await requirePermission("finance:view");
  const params = await searchParams;

  const fallback = defaultRange();
  const from = (typeof params.from === "string" ? params.from : undefined) ?? fallback.from;
  const to = (typeof params.to === "string" ? params.to : undefined) ?? fallback.to;

  const parsed = financeQuerySchema.parse({
    from,
    to,
    journalStatus: typeof params.status === "string" ? params.status : undefined,
    accountType: typeof params.type === "string" ? params.type : undefined,
    search: typeof params.search === "string" ? params.search : undefined,
  });

  const invoiceQuery = invoiceQuerySchema.parse({
    from,
    to,
    direction: typeof params.invDir === "string" ? params.invDir : undefined,
    invoiceStatus: typeof params.invStatus === "string" ? params.invStatus : undefined,
  });

  const bankQuery = bankQuerySchema.parse({
    from,
    to,
    bankAccountId: typeof params.bankId === "string" ? params.bankId : undefined,
    reconciled: typeof params.reconciled === "string" ? params.reconciled : undefined,
  });

  const query = { ...parsed, from, to };

  const [
    accounts,
    journals,
    expenses,
    invoices,
    bankAccounts,
    bankTransactions,
    invoiceSummary,
    cashFlow,
    profitAndLoss,
    balanceSheet,
    summary,
  ] = await Promise.all([
    financeService.accounts(ctx, query),
    financeService.journalEntries(ctx, query),
    financeService.expenses(ctx, query),
    invoicingService.invoices(ctx, invoiceQuery),
    invoicingService.bankAccounts(ctx),
    invoicingService.bankTransactions(ctx, bankQuery),
    invoicingService.invoiceSummary(ctx),
    invoicingService.cashFlow(ctx, from, to),
    financeService.profitAndLoss(ctx, from, to),
    financeService.balanceSheet(ctx, from, to),
    financeService.summary(ctx, from, to),
  ]);

  return (
    <FinanceManager
      accounts={accounts}
      journals={journals}
      expenses={expenses}
      invoices={invoices}
      bankAccounts={bankAccounts}
      bankTransactions={bankTransactions}
      invoiceSummary={invoiceSummary}
      cashFlow={cashFlow}
      profitAndLoss={profitAndLoss}
      balanceSheet={balanceSheet}
      summary={summary}
      from={from}
      to={to}
    />
  );
}
