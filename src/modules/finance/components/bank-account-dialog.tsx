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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BANK_ACCOUNT_KINDS } from "../dto/invoicing.dto";
import {
  createBankAccountAction,
  updateBankAccountAction,
} from "../actions/invoicing.actions";
import type { AccountRow } from "./account-dialog";

export interface BankAccountRow {
  id: string;
  name: string;
  kind: string;
  bankName: string | null;
  accountNumber: string | null;
  iban: string | null;
  currency: string;
  openingBalance: number;
  glAccountId: string | null;
  isPrimary: boolean;
  balance: number;
  unreconciledCount: number;
}

interface Props {
  open: boolean;
  account?: BankAccountRow;
  glAccounts: AccountRow[];
  onClose: () => void;
}

const NO_ACCOUNT = "__none__";

export const bankKindLabel = (kind: string) =>
  kind
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");

export function BankAccountDialog({ open, account, glAccounts, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("CHECKING");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [iban, setIban] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [glAccountId, setGlAccountId] = useState(NO_ACCOUNT);
  const [isPrimary, setIsPrimary] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? "");
    setKind(account?.kind ?? "CHECKING");
    setBankName(account?.bankName ?? "");
    setAccountNumber(account?.accountNumber ?? "");
    setIban(account?.iban ?? "");
    setCurrency(account?.currency ?? "USD");
    setOpeningBalance(account ? String(account.openingBalance) : "0");
    setGlAccountId(account?.glAccountId ?? NO_ACCOUNT);
    setIsPrimary(account?.isPrimary ?? false);
  }, [open, account]);

  // Only asset accounts can mirror a bank balance.
  const assetAccounts = glAccounts.filter((a) => a.type === "ASSET");

  const submit = () =>
    startTransition(async () => {
      const input = {
        name,
        kind,
        bankName,
        accountNumber,
        iban,
        currency: currency.toUpperCase(),
        openingBalance: Number(openingBalance) || 0,
        glAccountId: glAccountId === NO_ACCOUNT ? "" : glAccountId,
        isPrimary,
      };
      const result = account
        ? await updateBankAccountAction(account.id, input)
        : await createBankAccountAction(input);
      if (result.ok) {
        toast.success(account ? "Account updated" : "Account added");
        onClose();
        router.refresh();
      } else {
        toast.error(
          result.error.fields?.name || result.error.fields?.currency || result.error.message,
        );
      }
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{account ? "Edit account" : "New bank account"}</DialogTitle>
          <DialogDescription>
            Cash drawers and mobile wallets belong here too — anything that holds money.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ba-name">Name *</Label>
              <Input
                id="ba-name"
                placeholder="Operating account"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ba-kind">Kind</Label>
              <Select value={kind} onValueChange={(value) => setKind(value ?? "CHECKING")}>
                <SelectTrigger id="ba-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BANK_ACCOUNT_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {bankKindLabel(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ba-bank">Bank</Label>
              <Input
                id="ba-bank"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ba-number">Account number</Label>
              <Input
                id="ba-number"
                placeholder="••••4321"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Store a masked value — full numbers are not needed here.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="ba-iban">IBAN</Label>
              <Input id="ba-iban" value={iban} onChange={(e) => setIban(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ba-currency">Currency</Label>
              <Input
                id="ba-currency"
                maxLength={3}
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ba-opening">Opening balance</Label>
              <Input
                id="ba-opening"
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ba-gl">Mirrored GL account</Label>
            <Select
              value={glAccountId}
              onValueChange={(value) => setGlAccountId(value ?? NO_ACCOUNT)}
            >
              <SelectTrigger id="ba-gl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ACCOUNT}>Unassigned</SelectItem>
                {assetAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={isPrimary}
              onCheckedChange={(checked) => setIsPrimary(checked === true)}
            />
            Primary account — pre-selected when recording payments
          </label>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={pending || !name.trim() || !/^[A-Za-z]{3}$/.test(currency)}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {account ? "Update" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
