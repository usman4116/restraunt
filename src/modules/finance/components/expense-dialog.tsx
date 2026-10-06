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
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createExpenseAction, updateExpenseAction } from "../actions/finance.actions";
import type { AccountRow } from "./account-dialog";

export interface ExpenseRow {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  taxAmount: number;
  expenseDate: Date | string;
  vendorName: string | null;
  receiptUrl: string | null;
  accountId: string | null;
}

interface Props {
  open: boolean;
  expense?: ExpenseRow;
  accounts: AccountRow[];
  defaultDate: string;
  onClose: () => void;
}

const NO_ACCOUNT = "__none__";

export function ExpenseDialog({ open, expense, accounts, defaultDate, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("0");
  const [taxAmount, setTaxAmount] = useState("0");
  const [expenseDate, setExpenseDate] = useState(defaultDate);
  const [vendorName, setVendorName] = useState("");
  const [accountId, setAccountId] = useState(NO_ACCOUNT);
  const [receiptUrl, setReceiptUrl] = useState("");

  useEffect(() => {
    if (!open) return;
    setCategory(expense?.category ?? "");
    setDescription(expense?.description ?? "");
    setAmount(expense ? String(expense.amount) : "0");
    setTaxAmount(expense ? String(expense.taxAmount) : "0");
    setExpenseDate(
      expense ? new Date(expense.expenseDate).toISOString().split("T")[0] : defaultDate,
    );
    setVendorName(expense?.vendorName ?? "");
    setAccountId(expense?.accountId ?? NO_ACCOUNT);
    setReceiptUrl(expense?.receiptUrl ?? "");
  }, [open, expense, defaultDate]);

  // Only expense-type accounts make sense here.
  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE");

  const submit = () =>
    startTransition(async () => {
      const input = {
        category,
        description,
        amount: Number(amount),
        taxAmount: Number(taxAmount),
        expenseDate,
        vendorName,
        accountId: accountId === NO_ACCOUNT ? "" : accountId,
        receiptUrl,
      };
      const result = expense
        ? await updateExpenseAction(expense.id, input)
        : await createExpenseAction(input);
      if (result.ok) {
        toast.success(expense ? "Expense updated" : "Expense recorded");
        onClose();
        router.refresh();
      } else {
        const fields = result.error.fields;
        toast.error(fields?.amount || fields?.category || fields?.receiptUrl || result.error.message);
      }
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit expense" : "Record expense"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="x-cat">Category *</Label>
              <Input
                id="x-cat"
                placeholder="Utilities"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="x-date">Date *</Label>
              <Input
                id="x-date"
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="x-amount">Amount *</Label>
              <Input
                id="x-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="x-tax">Tax</Label>
              <Input
                id="x-tax"
                type="number"
                step="0.01"
                min="0"
                value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="x-vendor">Vendor</Label>
            <Input
              id="x-vendor"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="x-account">Expense account</Label>
            <Select value={accountId} onValueChange={(value) => setAccountId(value ?? NO_ACCOUNT)}>
              <SelectTrigger id="x-account">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ACCOUNT}>Unassigned</SelectItem>
                {expenseAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="x-receipt">Receipt URL</Label>
            <Input
              id="x-receipt"
              placeholder="https://…"
              value={receiptUrl}
              onChange={(e) => setReceiptUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="x-desc">Description</Label>
            <Textarea
              id="x-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={pending || !category.trim() || Number(amount) <= 0 || !expenseDate}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {expense ? "Update" : "Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
