"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAYMENT_METHODS } from "../dto/invoicing.dto";
import { payInvoiceAction } from "../actions/invoicing.actions";
import type { InvoiceRow } from "./invoice-dialog";
import type { BankAccountRow } from "./bank-account-dialog";

interface Props {
  open: boolean;
  invoice?: InvoiceRow;
  bankAccounts: BankAccountRow[];
  defaultDate: string;
  onClose: () => void;
}

const NO_ACCOUNT = "__none__";

const methodLabel = (method: string) =>
  method
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");

export function InvoicePaymentDialog({
  open,
  invoice,
  bankAccounts,
  defaultDate,
  onClose,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("0");
  const [paidAt, setPaidAt] = useState(defaultDate);
  const [method, setMethod] = useState<string>("BANK_TRANSFER");
  const [bankAccountId, setBankAccountId] = useState(NO_ACCOUNT);
  const [reference, setReference] = useState("");

  useEffect(() => {
    if (!open) return;
    // Default to settling the invoice in full — the common case.
    setAmount(invoice ? String(invoice.amountDue) : "0");
    setPaidAt(defaultDate);
    setMethod("BANK_TRANSFER");
    setBankAccountId(bankAccounts.find((a) => a.isPrimary)?.id ?? NO_ACCOUNT);
    setReference("");
  }, [open, invoice, defaultDate, bankAccounts]);

  const due = invoice?.amountDue ?? 0;
  const entered = Number(amount) || 0;
  const overpaying = Math.round(entered * 100) > Math.round(due * 100);

  const submit = () =>
    startTransition(async () => {
      if (!invoice) return;
      const result = await payInvoiceAction({
        invoiceId: invoice.id,
        bankAccountId: bankAccountId === NO_ACCOUNT ? "" : bankAccountId,
        amount: entered,
        paidAt,
        method,
        reference,
        notes: "",
      });
      if (result.ok) {
        toast.success("Payment recorded");
        onClose();
        router.refresh();
      } else {
        toast.error(result.error.fields?.amount || result.error.message);
      }
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {invoice
              ? `${invoice.invoiceNumber} — ${invoice.partyName} · ${due.toFixed(2)} outstanding`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pay-amount">Amount *</Label>
              <Input
                id="pay-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {overpaying && (
                <p className="text-xs text-destructive">
                  More than the {due.toFixed(2)} outstanding.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-date">Date *</Label>
              <Input
                id="pay-date"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay-method">Method</Label>
            <Select value={method} onValueChange={(value) => setMethod(value ?? "BANK_TRANSFER")}>
              <SelectTrigger id="pay-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {methodLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay-bank">Bank account</Label>
            <Select
              value={bankAccountId}
              onValueChange={(value) => setBankAccountId(value ?? NO_ACCOUNT)}
            >
              <SelectTrigger id="pay-bank">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ACCOUNT}>Do not record cash movement</SelectItem>
                {bankAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Picking an account posts a matching row to the cash ledger.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay-ref">Reference</Label>
            <Input
              id="pay-ref"
              placeholder="Transfer ID or cheque number"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={pending || entered <= 0 || overpaying || !paidAt || !invoice}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
