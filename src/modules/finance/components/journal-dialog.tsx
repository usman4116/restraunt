"use client";

import { useState, useTransition } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createJournalAction } from "../actions/finance.actions";
import type { AccountRow } from "./account-dialog";

interface Props {
  accounts: AccountRow[];
  defaultDate: string;
  onClose: () => void;
}

interface DraftLine {
  key: number;
  accountId: string;
  debit: string;
  credit: string;
  memo: string;
}

const money = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });

const emptyLine = (key: number): DraftLine => ({
  key,
  accountId: "",
  debit: "",
  credit: "",
  memo: "",
});

export function JournalDialog({ accounts, defaultDate, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [entryDate, setEntryDate] = useState(defaultDate);
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(0), emptyLine(1)]);
  const [nextKey, setNextKey] = useState(2);

  const patch = (key: number, changes: Partial<DraftLine>) =>
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...changes } : l)));

  const addLine = () => {
    setLines((current) => [...current, emptyLine(nextKey)]);
    setNextKey((n) => n + 1);
  };

  const removeLine = (key: number) =>
    setLines((current) => (current.length <= 2 ? current : current.filter((l) => l.key !== key)));

  // Totals in cents so the running balance readout never drifts.
  const cents = (v: string) => Math.round((Number(v) || 0) * 100);
  const debitTotal = lines.reduce((sum, l) => sum + cents(l.debit), 0);
  const creditTotal = lines.reduce((sum, l) => sum + cents(l.credit), 0);
  const difference = debitTotal - creditTotal;
  const balanced = difference === 0 && debitTotal > 0;
  const linesReady = lines.every(
    (l) => l.accountId && (cents(l.debit) > 0) !== (cents(l.credit) > 0),
  );

  const submit = () =>
    startTransition(async () => {
      const result = await createJournalAction({
        entryDate,
        memo,
        referenceType: "manual",
        lines: lines.map((l) => ({
          accountId: l.accountId,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          memo: l.memo,
        })),
      });
      if (result.ok) {
        toast.success("Draft entry created");
        onClose();
        router.refresh();
      } else {
        toast.error(result.error.fields?.lines || result.error.message);
      }
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New journal entry</DialogTitle>
          <DialogDescription>
            Entries are created as drafts. Post them once the debits and credits agree.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-[12rem_1fr] gap-3">
            <div className="space-y-2">
              <Label htmlFor="j-date">Entry date *</Label>
              <Input
                id="j-date"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="j-memo">Memo</Label>
              <Input
                id="j-memo"
                placeholder="What is this entry for?"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Lines *</Label>
              <Button size="sm" variant="outline" onClick={addLine}>
                <Plus className="size-4" /> Add line
              </Button>
            </div>

            <div className="space-y-2">
              {lines.map((line) => (
                <div
                  key={line.key}
                  className="grid grid-cols-[1fr_7rem_7rem_auto] items-center gap-2"
                >
                  <Select
                    value={line.accountId}
                    onValueChange={(value) => patch(line.key, { accountId: value ?? "" })}
                  >
                    <SelectTrigger aria-label="Account">
                      <SelectValue placeholder="Pick an account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.code} · {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Debit"
                    aria-label="Debit"
                    value={line.debit}
                    onChange={(e) =>
                      // A line is one side or the other, so typing a debit clears the credit.
                      patch(line.key, { debit: e.target.value, credit: "" })
                    }
                  />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Credit"
                    aria-label="Credit"
                    value={line.credit}
                    onChange={(e) => patch(line.key, { credit: e.target.value, debit: "" })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Remove line"
                    disabled={lines.length <= 2}
                    onClick={() => removeLine(line.key)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-6 rounded-lg border bg-muted/40 px-4 py-2 text-sm tabular-nums">
            <span>
              Debits <strong>{money.format(debitTotal / 100)}</strong>
            </span>
            <span>
              Credits <strong>{money.format(creditTotal / 100)}</strong>
            </span>
            <span
              className={cn(
                "font-medium",
                balanced ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600",
              )}
            >
              {balanced ? "Balanced" : `Out by ${money.format(Math.abs(difference) / 100)}`}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !balanced || !linesReady || !entryDate}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
