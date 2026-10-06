"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INVOICE_DIRECTIONS } from "../dto/invoicing.dto";
import { createInvoiceAction, updateInvoiceAction } from "../actions/invoicing.actions";
import type { AccountRow } from "./account-dialog";

export interface InvoiceLineRow {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  lineTotal: number;
  accountId: string | null;
}

export interface InvoicePaymentRow {
  id: string;
  amount: number;
  paidAt: Date | string;
  method: string;
  reference: string | null;
  bankAccountId: string | null;
}

export interface InvoiceRow {
  id: string;
  direction: string;
  invoiceNumber: string;
  invoiceStatus: string;
  partyName: string;
  customerId: string | null;
  supplierId: string | null;
  issueDate: Date | string;
  dueDate: Date | string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  daysOverdue: number;
  notes: string | null;
  terms: string | null;
  lines: InvoiceLineRow[];
  payments: InvoicePaymentRow[];
}

interface Props {
  open: boolean;
  invoice?: InvoiceRow;
  accounts: AccountRow[];
  defaultDate: string;
  onClose: () => void;
}

interface DraftLine {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  accountId: string;
}

const NO_ACCOUNT = "__none__";

const blankLine = (): DraftLine => ({
  description: "",
  quantity: "1",
  unitPrice: "0",
  taxRate: "0",
  accountId: NO_ACCOUNT,
});

const isoDate = (value: Date | string) => new Date(value).toISOString().split("T")[0];

/** Due 30 days out is the default across the app's supplier terms. */
function defaultDueDate(from: string) {
  const date = new Date(`${from}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 30);
  return date.toISOString().split("T")[0];
}

const money = (n: number) => n.toFixed(2);

export function InvoiceDialog({ open, invoice, accounts, defaultDate, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [direction, setDirection] = useState<string>("SALES");
  const [partyName, setPartyName] = useState("");
  const [issueDate, setIssueDate] = useState(defaultDate);
  const [dueDate, setDueDate] = useState(defaultDueDate(defaultDate));
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);

  useEffect(() => {
    if (!open) return;
    setDirection(invoice?.direction ?? "SALES");
    setPartyName(invoice?.partyName ?? "");
    setIssueDate(invoice ? isoDate(invoice.issueDate) : defaultDate);
    setDueDate(invoice ? isoDate(invoice.dueDate) : defaultDueDate(defaultDate));
    setNotes(invoice?.notes ?? "");
    setTerms(invoice?.terms ?? "");
    setLines(
      invoice && invoice.lines.length > 0
        ? invoice.lines.map((l) => ({
            description: l.description,
            quantity: String(l.quantity),
            unitPrice: String(l.unitPrice),
            taxRate: String(l.taxRate),
            accountId: l.accountId ?? NO_ACCOUNT,
          }))
        : [blankLine()],
    );
  }, [open, invoice, defaultDate]);

  const setLine = (index: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const addLine = () => setLines((prev) => [...prev, blankLine()]);

  // Always leave one row standing so the form is never empty.
  const removeLine = (index: number) =>
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));

  // Sales invoices credit revenue; purchase invoices debit expense.
  const lineAccounts = accounts.filter((a) =>
    direction === "SALES" ? a.type === "REVENUE" : a.type === "EXPENSE",
  );

  const numeric = lines.map((line) => ({
    quantity: Number(line.quantity) || 0,
    unitPrice: Number(line.unitPrice) || 0,
    taxRate: Number(line.taxRate) || 0,
  }));
  const subtotal = numeric.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const taxTotal = numeric.reduce(
    (sum, l) => sum + l.quantity * l.unitPrice * (l.taxRate / 100),
    0,
  );
  const total = subtotal + taxTotal;

  const valid =
    partyName.trim().length > 0 &&
    issueDate.length > 0 &&
    dueDate >= issueDate &&
    total > 0 &&
    lines.every((l) => l.description.trim().length > 0);

  const submit = () =>
    startTransition(async () => {
      const input = {
        direction,
        partyName,
        customerId: "",
        supplierId: "",
        issueDate,
        dueDate,
        notes,
        terms,
        lines: lines.map((line) => ({
          description: line.description,
          quantity: Number(line.quantity) || 0,
          unitPrice: Number(line.unitPrice) || 0,
          taxRate: Number(line.taxRate) || 0,
          accountId: line.accountId === NO_ACCOUNT ? "" : line.accountId,
        })),
      };
      const result = invoice
        ? await updateInvoiceAction(invoice.id, input)
        : await createInvoiceAction(input);
      if (result.ok) {
        toast.success(invoice ? "Invoice updated" : "Invoice drafted");
        onClose();
        router.refresh();
      } else {
        const fields = result.error.fields;
        toast.error(
          fields?.dueDate || fields?.partyName || fields?.lines || result.error.message,
        );
      }
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {invoice ? `Edit ${invoice.invoiceNumber}` : "New invoice"}
          </DialogTitle>
          <DialogDescription>
            A draft can be edited freely. Issuing it locks the document and starts the clock on
            payment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="inv-direction">Type *</Label>
              <Select
                value={direction}
                onValueChange={(value) => setDirection(value ?? "SALES")}
                disabled={Boolean(invoice)}
              >
                <SelectTrigger id="inv-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVOICE_DIRECTIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d === "SALES" ? "Sales invoice (receivable)" : "Purchase bill (payable)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-party">
                {direction === "SALES" ? "Customer *" : "Supplier *"}
              </Label>
              <Input
                id="inv-party"
                placeholder={direction === "SALES" ? "Acme Catering" : "Fresh Produce Co."}
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="inv-issue">Issue date *</Label>
              <Input
                id="inv-issue"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-due">Due date *</Label>
              <Input
                id="inv-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              {dueDate < issueDate && (
                <p className="text-xs text-destructive">
                  Due date cannot be before the issue date.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Lines *</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="size-4" /> Add line
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((line, index) => (
                <div
                  key={index}
                  className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-[1fr_5rem_6rem_5rem_auto]"
                >
                  <Input
                    aria-label={`Line ${index + 1} description`}
                    placeholder="Catering — 40 covers"
                    value={line.description}
                    onChange={(e) => setLine(index, { description: e.target.value })}
                  />
                  <Input
                    aria-label={`Line ${index + 1} quantity`}
                    type="number"
                    step="0.001"
                    min="0"
                    value={line.quantity}
                    onChange={(e) => setLine(index, { quantity: e.target.value })}
                  />
                  <Input
                    aria-label={`Line ${index + 1} unit price`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.unitPrice}
                    onChange={(e) => setLine(index, { unitPrice: e.target.value })}
                  />
                  <Input
                    aria-label={`Line ${index + 1} tax percent`}
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={line.taxRate}
                    onChange={(e) => setLine(index, { taxRate: e.target.value })}
                  />
                  <div className="flex items-center gap-2">
                    <span className="w-20 text-right text-sm tabular-nums">
                      {money(
                        (Number(line.quantity) || 0) *
                          (Number(line.unitPrice) || 0) *
                          (1 + (Number(line.taxRate) || 0) / 100),
                      )}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove line ${index + 1}`}
                      disabled={lines.length === 1}
                      onClick={() => removeLine(index)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="sm:col-span-5">
                    <Select
                      value={line.accountId}
                      onValueChange={(value) =>
                        setLine(index, { accountId: value ?? NO_ACCOUNT })
                      }
                    >
                      <SelectTrigger aria-label={`Line ${index + 1} account`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_ACCOUNT}>Unassigned account</SelectItem>
                        {lineAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.code} · {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-6 pt-1 text-sm tabular-nums">
              <span className="text-muted-foreground">
                Subtotal <span className="text-foreground">{money(subtotal)}</span>
              </span>
              <span className="text-muted-foreground">
                Tax <span className="text-foreground">{money(taxTotal)}</span>
              </span>
              <span className="font-medium">Total {money(total)}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="inv-terms">Terms</Label>
              <Input
                id="inv-terms"
                placeholder="Net 30"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-notes">Notes</Label>
              <Textarea
                id="inv-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !valid}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {invoice ? "Update" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
