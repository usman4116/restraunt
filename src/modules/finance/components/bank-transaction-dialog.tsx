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
import { BANK_DIRECTIONS } from "../dto/invoicing.dto";
import { createBankTransactionAction } from "../actions/invoicing.actions";
import type { BankAccountRow } from "./bank-account-dialog";

export interface BankTransactionRow {
  id: string;
  bankAccountId: string;
  bankAccountName: string;
  direction: string;
  amount: number;
  signedAmount: number;
  txnDate: Date | string;
  description: string;
  category: string | null;
  reference: string | null;
  counterparty: string | null;
  reconciledAt: Date | string | null;
  invoiceId: string | null;
  activity: string;
}

interface Props {
  open: boolean;
  bankAccounts: BankAccountRow[];
  defaultDate: string;
  onClose: () => void;
}

/**
 * Suggested categories. Free text is still allowed — these just cover the
 * common cases and line up with the cash-flow activity mapping in the service.
 */
const CATEGORY_SUGGESTIONS = [
  "Sales",
  "Supplier payment",
  "Payroll",
  "Rent",
  "Utilities",
  "Equipment",
  "Loan",
  "Loan repayment",
  "Owner draw",
  "Capital",
];

export function BankTransactionDialog({ open, bankAccounts, defaultDate, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [bankAccountId, setBankAccountId] = useState("");
  const [direction, setDirection] = useState<string>("OUTFLOW");
  const [amount, setAmount] = useState("0");
  const [txnDate, setTxnDate] = useState(defaultDate);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [reference, setReference] = useState("");

  useEffect(() => {
    if (!open) return;
    setBankAccountId(bankAccounts.find((a) => a.isPrimary)?.id ?? bankAccounts[0]?.id ?? "");
    setDirection("OUTFLOW");
    setAmount("0");
    setTxnDate(defaultDate);
    setDescription("");
    setCategory("");
    setCounterparty("");
    setReference("");
  }, [open, bankAccounts, defaultDate]);

  const submit = () =>
    startTransition(async () => {
      const result = await createBankTransactionAction({
        bankAccountId,
        direction,
        amount: Number(amount) || 0,
        txnDate,
        description,
        category,
        reference,
        counterparty,
      });
      if (result.ok) {
        toast.success("Transaction recorded");
        onClose();
        router.refresh();
      } else {
        toast.error(result.error.fields?.amount || result.error.message);
      }
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record cash movement</DialogTitle>
          <DialogDescription>
            For money in or out that no invoice covers — rent, payroll, a loan draw.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bt-account">Account *</Label>
            <Select
              value={bankAccountId}
              onValueChange={(value) => setBankAccountId(value ?? "")}
            >
              <SelectTrigger id="bt-account">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="bt-direction">Direction</Label>
              <Select
                value={direction}
                onValueChange={(value) => setDirection(value ?? "OUTFLOW")}
              >
                <SelectTrigger id="bt-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BANK_DIRECTIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d === "INFLOW" ? "Money in" : "Money out"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bt-amount">Amount *</Label>
              <Input
                id="bt-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bt-date">Date *</Label>
              <Input
                id="bt-date"
                type="date"
                value={txnDate}
                onChange={(e) => setTxnDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bt-desc">Description *</Label>
            <Input
              id="bt-desc"
              placeholder="August rent"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bt-category">Category</Label>
              <Input
                id="bt-category"
                list="bt-category-options"
                placeholder="Rent"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
              <datalist id="bt-category-options">
                {CATEGORY_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                Drives the cash-flow grouping. Blank counts as operating.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bt-counterparty">Counterparty</Label>
              <Input
                id="bt-counterparty"
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bt-ref">Reference</Label>
            <Input
              id="bt-ref"
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
            disabled={
              pending ||
              !bankAccountId ||
              Number(amount) <= 0 ||
              !description.trim() ||
              !txnDate
            }
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
