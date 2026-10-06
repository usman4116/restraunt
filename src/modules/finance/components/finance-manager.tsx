"use client";

import { Fragment, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  BookOpen,
  Receipt,
  TrendingUp,
  Scale,
  Undo2,
  Check,
  AlertTriangle,
  FileText,
  Landmark,
  Send,
  Ban,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  CircleDollarSign,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  deleteAccountAction,
  postJournalAction,
  reverseJournalAction,
  deleteJournalAction,
  deleteExpenseAction,
} from "../actions/finance.actions";
import {
  issueInvoiceAction,
  voidInvoiceAction,
  deleteInvoiceAction,
  deleteBankAccountAction,
  reconcileBankTransactionAction,
  deleteBankTransactionAction,
} from "../actions/invoicing.actions";
import { AccountDialog, type AccountRow } from "./account-dialog";
import { JournalDialog } from "./journal-dialog";
import { ExpenseDialog, type ExpenseRow } from "./expense-dialog";
import { InvoiceDialog, type InvoiceRow } from "./invoice-dialog";
import { InvoicePaymentDialog } from "./invoice-payment-dialog";
import {
  BankAccountDialog,
  bankKindLabel,
  type BankAccountRow,
} from "./bank-account-dialog";
import {
  BankTransactionDialog,
  type BankTransactionRow,
} from "./bank-transaction-dialog";

export interface JournalLineRow {
  id: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string | null;
}

export interface JournalRow {
  id: string;
  entryNumber: string;
  entryDate: Date | string;
  memo: string | null;
  journalStatus: string;
  referenceType: string | null;
  debitTotal: number;
  creditTotal: number;
  postedAt: Date | string | null;
  lines: JournalLineRow[];
}

export interface StatementRow {
  id: string;
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
}

interface Props {
  accounts: AccountRow[];
  journals: JournalRow[];
  expenses: ExpenseRow[];
  invoices: InvoiceRow[];
  bankAccounts: BankAccountRow[];
  bankTransactions: BankTransactionRow[];
  invoiceSummary: {
    openReceivable: number;
    openPayable: number;
    openSalesCount: number;
    openPurchaseCount: number;
    overdueCount: number;
  };
  cashFlow: {
    openingBalance: number;
    closingBalance: number;
    operating: { inflow: number; outflow: number; net: number };
    investing: { inflow: number; outflow: number; net: number };
    financing: { inflow: number; outflow: number; net: number };
    totalInflow: number;
    totalOutflow: number;
    netChange: number;
    categories: { category: string; inflow: number; outflow: number; net: number }[];
  };
  profitAndLoss: {
    revenueRows: StatementRow[];
    expenseRows: StatementRow[];
    revenue: number;
    expenses: number;
    netProfit: number;
    margin: number;
  };
  balanceSheet: {
    assetRows: StatementRow[];
    liabilityRows: StatementRow[];
    equityRows: StatementRow[];
    assets: number;
    liabilities: number;
    equityPosted: number;
    retainedEarnings: number;
    equity: number;
    balances: boolean;
  };
  summary: {
    draftEntries: number;
    totalExpenses: number;
    revenue: number;
    cogs: number;
    grossProfit: number;
  };
  from: string;
  to: string;
}

const JOURNAL_STYLES: Record<string, string> = {
  DRAFT: "bg-amber-500/15 text-amber-700 dark:text-amber-500",
  POSTED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  REVERSED: "bg-muted text-muted-foreground",
};

const INVOICE_STYLES: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  ISSUED: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  PARTIALLY_PAID: "bg-amber-500/15 text-amber-700 dark:text-amber-500",
  PAID: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  OVERDUE: "bg-destructive/15 text-destructive",
  VOID: "bg-muted text-muted-foreground line-through",
};

const money = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });
const dayFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

export function FinanceManager({
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
  from,
  to,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const [accountDialog, setAccountDialog] = useState<{ open: boolean; account?: AccountRow }>({
    open: false,
  });
  const [journalOpen, setJournalOpen] = useState(false);
  const [expenseDialog, setExpenseDialog] = useState<{ open: boolean; expense?: ExpenseRow }>({
    open: false,
  });
  const [invoiceDialog, setInvoiceDialog] = useState<{ open: boolean; invoice?: InvoiceRow }>({
    open: false,
  });
  const [paymentDialog, setPaymentDialog] = useState<{ open: boolean; invoice?: InvoiceRow }>({
    open: false,
  });
  const [bankAccountDialog, setBankAccountDialog] = useState<{
    open: boolean;
    account?: BankAccountRow;
  }>({ open: false });
  const [bankTxnOpen, setBankTxnOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(search.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  };

  const removeAccount = async (account: AccountRow) => {
    if (!confirm(`Remove account ${account.code} · ${account.name}?`)) return;
    const result = await deleteAccountAction(account.id);
    if (result.ok) {
      toast.success("Account removed");
      router.refresh();
    } else toast.error(result.error.message);
  };

  const post = async (journal: JournalRow) => {
    const result = await postJournalAction({ journalEntryId: journal.id });
    if (result.ok) {
      toast.success(`${journal.entryNumber} posted`);
      router.refresh();
    } else toast.error(result.error.message);
  };

  const reverse = async (journal: JournalRow) => {
    if (!confirm(`Reverse ${journal.entryNumber}? This creates a mirror entry.`)) return;
    const result = await reverseJournalAction(journal.id);
    if (result.ok) {
      toast.success(`${journal.entryNumber} reversed`);
      router.refresh();
    } else toast.error(result.error.message);
  };

  const removeJournal = async (journal: JournalRow) => {
    if (!confirm(`Delete draft ${journal.entryNumber}?`)) return;
    const result = await deleteJournalAction(journal.id);
    if (result.ok) {
      toast.success("Draft deleted");
      router.refresh();
    } else toast.error(result.error.message);
  };

  const removeExpense = async (expense: ExpenseRow) => {
    if (!confirm(`Delete this ${expense.category} expense?`)) return;
    const result = await deleteExpenseAction(expense.id);
    if (result.ok) {
      toast.success("Expense deleted");
      router.refresh();
    } else toast.error(result.error.message);
  };

  const issueInvoice = async (invoice: InvoiceRow) => {
    if (!confirm(`Issue ${invoice.invoiceNumber}? It cannot be edited after issuing.`)) return;
    const result = await issueInvoiceAction(invoice.id);
    if (result.ok) { toast.success("Invoice issued"); router.refresh(); }
    else toast.error(result.error.message);
  };

  const voidInvoice = async (invoice: InvoiceRow) => {
    if (!confirm(`Void ${invoice.invoiceNumber}? This cannot be undone.`)) return;
    const result = await voidInvoiceAction(invoice.id);
    if (result.ok) { toast.success("Invoice voided"); router.refresh(); }
    else toast.error(result.error.message);
  };

  const removeInvoice = async (invoice: InvoiceRow) => {
    if (!confirm(`Delete draft ${invoice.invoiceNumber}?`)) return;
    const result = await deleteInvoiceAction(invoice.id);
    if (result.ok) { toast.success("Draft deleted"); router.refresh(); }
    else toast.error(result.error.message);
  };

  const removeBankAccount = async (account: BankAccountRow) => {
    if (!confirm(`Remove "${account.name}"?`)) return;
    const result = await deleteBankAccountAction(account.id);
    if (result.ok) { toast.success("Account removed"); router.refresh(); }
    else toast.error(result.error.message);
  };

  const toggleReconcile = async (txn: BankTransactionRow) => {
    const reconciled = !txn.reconciledAt;
    const result = await reconcileBankTransactionAction(txn.id, reconciled);
    if (result.ok) { toast.success(reconciled ? "Marked reconciled" : "Unmarked"); router.refresh(); }
    else toast.error(result.error.message);
  };

  const removeBankTxn = async (txn: BankTransactionRow) => {
    if (txn.invoiceId) { toast.error("Reverse the invoice payment instead of deleting the cash row."); return; }
    if (!confirm("Delete this transaction?")) return;
    const result = await deleteBankTransactionAction(txn.id);
    if (result.ok) { toast.success("Deleted"); router.refresh(); }
    else toast.error(result.error.message);
  };

  const statementRows = (rows: StatementRow[], emptyLabel: string) =>
    rows.length === 0 ? (
      <TableRow>
        <TableCell colSpan={3} className="h-16 text-center text-muted-foreground">
          {emptyLabel}
        </TableCell>
      </TableRow>
    ) : (
      rows.map((row) => (
        <TableRow key={row.id}>
          <TableCell className="tabular-nums text-muted-foreground">{row.code}</TableCell>
          <TableCell>{row.name}</TableCell>
          <TableCell className="text-right tabular-nums">{money.format(row.balance)}</TableCell>
        </TableRow>
      ))
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
          <p className="text-sm text-muted-foreground">
            Chart of accounts, double-entry ledger, expenses and statements
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-40"
            value={from}
            onChange={(e) => setParam("from", e.target.value)}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            className="w-40"
            value={to}
            onChange={(e) => setParam("to", e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          label="Revenue"
          value={money.format(profitAndLoss.revenue)}
          hint="Posted revenue accounts"
          icon={TrendingUp}
        />
        <StatTile
          label="Expenses"
          value={money.format(profitAndLoss.expenses)}
          hint={`${money.format(summary.totalExpenses)} recorded out of ledger`}
          icon={Receipt}
        />
        <StatTile
          label="Net profit"
          value={money.format(profitAndLoss.netProfit)}
          hint={`${profitAndLoss.margin}% margin`}
          icon={Scale}
          tone={profitAndLoss.netProfit < 0 ? "critical" : "default"}
        />
        <StatTile
          label="Receivable"
          value={money.format(invoiceSummary.openReceivable)}
          hint={`${invoiceSummary.openSalesCount} open invoices`}
          icon={FileText}
          tone={invoiceSummary.overdueCount > 0 ? "warning" : "default"}
        />
        <StatTile
          label="Cash"
          value={money.format(cashFlow.closingBalance)}
          hint={cashFlow.netChange >= 0 ? `+${money.format(cashFlow.netChange)} this period` : `${money.format(cashFlow.netChange)} this period`}
          icon={Landmark}
          tone={cashFlow.closingBalance < 0 ? "critical" : "default"}
        />
      </div>

      <Tabs defaultValue="journal">
        <TabsList>
          <TabsTrigger value="journal">Journal</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="bank">Bank</TabsTrigger>
          <TabsTrigger value="cashflow">Cash flow</TabsTrigger>
          <TabsTrigger value="pnl">P&amp;L</TabsTrigger>
          <TabsTrigger value="balance">Balance sheet</TabsTrigger>
        </TabsList>

        <TabsContent value="journal" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setJournalOpen(true)} disabled={accounts.length < 2}>
              <Plus className="size-4" /> New entry
            </Button>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entry</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Memo</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-56" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {journals.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      No journal entries in this period.
                    </TableCell>
                  </TableRow>
                )}
                {journals.map((journal) => (
                  <Fragment key={journal.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setExpanded(expanded === journal.id ? null : journal.id)}
                    >
                      <TableCell className="font-medium tabular-nums">
                        {journal.entryNumber}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {dayFormat.format(new Date(journal.entryDate))}
                      </TableCell>
                      <TableCell className="max-w-72 truncate text-sm text-muted-foreground">
                        {journal.memo || "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money.format(journal.debitTotal)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            JOURNAL_STYLES[journal.journalStatus] ?? "bg-muted",
                          )}
                        >
                          {journal.journalStatus.toLowerCase()}
                        </span>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {journal.journalStatus === "DRAFT" && (
                            <>
                              <Button size="sm" onClick={() => post(journal)}>
                                <Check className="size-4" /> Post
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Delete draft"
                                onClick={() => removeJournal(journal)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </>
                          )}
                          {journal.journalStatus === "POSTED" && (
                            <Button size="sm" variant="outline" onClick={() => reverse(journal)}>
                              <Undo2 className="size-4" /> Reverse
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expanded === journal.id && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/40 p-0">
                          <div className="px-6 py-3">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Account</TableHead>
                                  <TableHead>Memo</TableHead>
                                  <TableHead className="text-right">Debit</TableHead>
                                  <TableHead className="text-right">Credit</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {journal.lines.map((line) => (
                                  <TableRow key={line.id}>
                                    <TableCell className="text-sm">
                                      <span className="tabular-nums text-muted-foreground">
                                        {line.accountCode}
                                      </span>{" "}
                                      {line.accountName}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                      {line.memo || "—"}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {line.debit > 0 ? money.format(line.debit) : "—"}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {line.credit > 0 ? money.format(line.credit) : "—"}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="accounts" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search code or name…"
                className="w-72 pl-8"
                defaultValue={search.get("search") ?? ""}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setParam("search", (e.target as HTMLInputElement).value);
                }}
              />
            </div>
            <Button onClick={() => setAccountDialog({ open: true })}>
              <Plus className="size-4" /> New account
            </Button>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                      No accounts yet — start with cash, sales and a cost of goods account.
                    </TableCell>
                  </TableRow>
                )}
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium tabular-nums">{account.code}</TableCell>
                    <TableCell>
                      {account.name}
                      {account.isSystem && (
                        <Badge variant="outline" className="ml-2">
                          System
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {account.type.charAt(0) + account.type.slice(1).toLowerCase()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Edit"
                          disabled={account.isSystem}
                          onClick={() => setAccountDialog({ open: true, account })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Remove"
                          disabled={account.isSystem}
                          onClick={() => removeAccount(account)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="expenses" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setExpenseDialog({ open: true })}>
              <Plus className="size-4" /> Record expense
            </Button>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      No expenses in this period.
                    </TableCell>
                  </TableRow>
                )}
                {expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="tabular-nums">
                      {dayFormat.format(new Date(expense.expenseDate))}
                    </TableCell>
                    <TableCell className="font-medium">
                      {expense.category}
                      {expense.description && (
                        <div className="max-w-64 truncate text-xs font-normal text-muted-foreground">
                          {expense.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {expense.vendorName || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money.format(expense.amount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {money.format(expense.taxAmount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Edit"
                          onClick={() => setExpenseDialog({ open: true, expense })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Delete"
                          onClick={() => removeExpense(expense)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="invoices" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setInvoiceDialog({ open: true })}>
              <Plus className="size-4" /> New invoice
            </Button>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead className="w-56" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      No invoices in this period.
                    </TableCell>
                  </TableRow>
                )}
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium tabular-nums">{inv.invoiceNumber}</TableCell>
                    <TableCell className="max-w-40 truncate">{inv.partyName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {inv.direction === "SALES" ? "Receivable" : "Payable"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn("text-xs", INVOICE_STYLES[inv.invoiceStatus])}>
                        {inv.invoiceStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money.format(inv.totalAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money.format(inv.amountDue)}</TableCell>
                    <TableCell className="tabular-nums text-sm">
                      {dayFormat.format(new Date(inv.dueDate))}
                      {inv.daysOverdue > 0 && (
                        <span className="ml-1 text-xs text-destructive">+{inv.daysOverdue}d</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {inv.invoiceStatus === "DRAFT" && (
                          <>
                            <Button size="icon" variant="ghost" title="Edit" onClick={() => setInvoiceDialog({ open: true, invoice: inv })}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Issue" onClick={() => issueInvoice(inv)}>
                              <Send className="size-4" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Delete" onClick={() => removeInvoice(inv)}>
                              <Trash2 className="size-4" />
                            </Button>
                          </>
                        )}
                        {(inv.invoiceStatus === "ISSUED" || inv.invoiceStatus === "PARTIALLY_PAID" || inv.invoiceStatus === "OVERDUE") && (
                          <>
                            <Button size="icon" variant="ghost" title="Record payment" onClick={() => setPaymentDialog({ open: true, invoice: inv })}>
                              <CircleDollarSign className="size-4" />
                            </Button>
                            {inv.amountPaid === 0 && (
                              <Button size="icon" variant="ghost" title="Void" onClick={() => voidInvoice(inv)}>
                                <Ban className="size-4" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="bank" className="space-y-3">
          <div className="flex justify-between">
            <Button onClick={() => setBankAccountDialog({ open: true })}>
              <Plus className="size-4" /> New account
            </Button>
            <Button onClick={() => setBankTxnOpen(true)} disabled={bankAccounts.length === 0}>
              <Plus className="size-4" /> Record transaction
            </Button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {bankAccounts.map((acc) => (
              <div key={acc.id} className="rounded-lg border">
                <div className="flex items-center justify-between border-b px-4 py-2">
                  <div>
                    <div className="font-medium">{acc.name}</div>
                    <div className="text-xs text-muted-foreground">{bankKindLabel(acc.kind)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" title="Edit" onClick={() => setBankAccountDialog({ open: true, account: acc })}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" title="Remove" onClick={() => removeBankAccount(acc)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-muted-foreground">Balance</span>
                    <span className="text-lg font-semibold tabular-nums">{money.format(acc.balance)}</span>
                  </div>
                  {acc.unreconciledCount > 0 && (
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                      {acc.unreconciledCount} unreconciled transaction{acc.unreconciledCount === 1 ? "" : "s"}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {bankAccounts.length === 0 && (
              <div className="col-span-2 flex h-32 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                No bank accounts yet.
              </div>
            )}
          </div>
          <div className="rounded-lg border">
            <div className="border-b px-4 py-2 text-sm font-medium">Recent transactions</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {bankTransactions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No transactions in this period.
                    </TableCell>
                  </TableRow>
                )}
                {bankTransactions.slice(0, 50).map((txn) => (
                  <TableRow key={txn.id} className={cn(txn.reconciledAt && "opacity-60")}>
                    <TableCell className="tabular-nums text-sm">{dayFormat.format(new Date(txn.txnDate))}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{txn.bankAccountName}</TableCell>
                    <TableCell className="max-w-60 truncate">{txn.description}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", txn.signedAmount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                      {txn.direction === "INFLOW" ? <ArrowDownLeft className="mr-1 inline size-3" /> : <ArrowUpRight className="mr-1 inline size-3" />}
                      {money.format(txn.amount)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{txn.category ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" title={txn.reconciledAt ? "Unreconcile" : "Reconcile"} onClick={() => toggleReconcile(txn)}>
                          <Check className={cn("size-4", txn.reconciledAt && "text-emerald-600")} />
                        </Button>
                        <Button size="icon" variant="ghost" title="Delete" disabled={Boolean(txn.invoiceId)} onClick={() => removeBankTxn(txn)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="cashflow" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Opening balance</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{money.format(cashFlow.openingBalance)}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Net change</div>
              <div className={cn("mt-1 text-2xl font-semibold tabular-nums", cashFlow.netChange >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                {cashFlow.netChange >= 0 ? "+" : ""}{money.format(cashFlow.netChange)}
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Closing balance</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{money.format(cashFlow.closingBalance)}</div>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {[
              { label: "Operating", data: cashFlow.operating },
              { label: "Investing", data: cashFlow.investing },
              { label: "Financing", data: cashFlow.financing },
            ].map((activity) => (
              <div key={activity.label} className="rounded-lg border">
                <div className="border-b px-4 py-2 text-sm font-medium">{activity.label}</div>
                <div className="space-y-2 p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Inflow</span>
                    <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{money.format(activity.data.inflow)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Outflow</span>
                    <span className="tabular-nums">({money.format(activity.data.outflow)})</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 font-medium">
                    <span>Net</span>
                    <span className={cn("tabular-nums", activity.data.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                      {money.format(activity.data.net)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border">
            <div className="border-b px-4 py-2 text-sm font-medium">Top categories</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Inflow</TableHead>
                  <TableHead className="text-right">Outflow</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cashFlow.categories.slice(0, 15).map((cat) => (
                  <TableRow key={cat.category}>
                    <TableCell>{cat.category}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{money.format(cat.inflow)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">({money.format(cat.outflow)})</TableCell>
                    <TableCell className={cn("text-right tabular-nums", cat.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                      {money.format(cat.net)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="pnl" className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border">
              <div className="border-b px-4 py-2 text-sm font-medium">Revenue</div>
              <Table>
                <TableBody>{statementRows(profitAndLoss.revenueRows, "No revenue posted.")}</TableBody>
              </Table>
              <div className="flex justify-between border-t px-4 py-2 text-sm font-medium tabular-nums">
                <span>Total revenue</span>
                <span>{money.format(profitAndLoss.revenue)}</span>
              </div>
            </div>

            <div className="rounded-lg border">
              <div className="border-b px-4 py-2 text-sm font-medium">Expenses</div>
              <Table>
                <TableBody>{statementRows(profitAndLoss.expenseRows, "No expenses posted.")}</TableBody>
              </Table>
              <div className="flex justify-between border-t px-4 py-2 text-sm font-medium tabular-nums">
                <span>Total expenses</span>
                <span>{money.format(profitAndLoss.expenses)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
            <span className="font-medium">Net profit</span>
            <span
              className={cn(
                "text-lg font-semibold tabular-nums",
                profitAndLoss.netProfit < 0 && "text-red-600 dark:text-red-400",
              )}
            >
              {money.format(profitAndLoss.netProfit)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({profitAndLoss.margin}%)
              </span>
            </span>
          </div>
        </TabsContent>

        <TabsContent value="balance" className="space-y-3">
          {!balanceSheet.balances && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-500">
              <AlertTriangle className="size-4 shrink-0" />
              Assets do not equal liabilities plus equity — check for unposted or unbalanced entries.
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border">
              <div className="border-b px-4 py-2 text-sm font-medium">Assets</div>
              <Table>
                <TableBody>{statementRows(balanceSheet.assetRows, "No assets posted.")}</TableBody>
              </Table>
              <div className="flex justify-between border-t px-4 py-2 text-sm font-medium tabular-nums">
                <span>Total assets</span>
                <span>{money.format(balanceSheet.assets)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border">
                <div className="border-b px-4 py-2 text-sm font-medium">Liabilities</div>
                <Table>
                  <TableBody>
                    {statementRows(balanceSheet.liabilityRows, "No liabilities posted.")}
                  </TableBody>
                </Table>
                <div className="flex justify-between border-t px-4 py-2 text-sm font-medium tabular-nums">
                  <span>Total liabilities</span>
                  <span>{money.format(balanceSheet.liabilities)}</span>
                </div>
              </div>

              <div className="rounded-lg border">
                <div className="border-b px-4 py-2 text-sm font-medium">Equity</div>
                <Table>
                  <TableBody>
                    {statementRows(balanceSheet.equityRows, "No equity accounts posted.")}
                    <TableRow>
                      <TableCell className="tabular-nums text-muted-foreground">—</TableCell>
                      <TableCell>Retained earnings (period)</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money.format(balanceSheet.retainedEarnings)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <div className="flex justify-between border-t px-4 py-2 text-sm font-medium tabular-nums">
                  <span>Total equity</span>
                  <span>{money.format(balanceSheet.equity)}</span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <AccountDialog
        open={accountDialog.open}
        account={accountDialog.account}
        accounts={accounts}
        onClose={() => setAccountDialog({ open: false })}
      />
      {journalOpen && (
        <JournalDialog
          accounts={accounts}
          defaultDate={to}
          onClose={() => setJournalOpen(false)}
        />
      )}
      <ExpenseDialog
        open={expenseDialog.open}
        expense={expenseDialog.expense}
        accounts={accounts}
        defaultDate={to}
        onClose={() => setExpenseDialog({ open: false })}
      />
      <InvoiceDialog
        open={invoiceDialog.open}
        invoice={invoiceDialog.invoice}
        accounts={accounts}
        defaultDate={to}
        onClose={() => setInvoiceDialog({ open: false })}
      />
      <InvoicePaymentDialog
        open={paymentDialog.open}
        invoice={paymentDialog.invoice}
        bankAccounts={bankAccounts}
        defaultDate={to}
        onClose={() => setPaymentDialog({ open: false })}
      />
      <BankAccountDialog
        open={bankAccountDialog.open}
        account={bankAccountDialog.account}
        glAccounts={accounts}
        onClose={() => setBankAccountDialog({ open: false })}
      />
      <BankTransactionDialog
        open={bankTxnOpen}
        bankAccounts={bankAccounts}
        defaultDate={to}
        onClose={() => setBankTxnOpen(false)}
      />
    </div>
  );
}
