"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus, Search, Pencil, Trash2, Gift, Users, Cake, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { deleteCustomerAction } from "../actions/customer.actions";
import { CustomerDialog, type CustomerRow } from "./customer-dialog";
import { LoyaltyDialog } from "./loyalty-dialog";
import { FeedbackPanel, type FeedbackRow } from "./feedback-panel";

interface Summary {
  total: number;
  optedIn: number;
  totalSpent: number;
  pointsOutstanding: number;
  openComplaints: number;
  birthdaysSoon: number;
}

interface Props {
  customers: CustomerRow[];
  feedback: FeedbackRow[];
  summary: Summary;
  total: number;
  page: number;
  pageSize: number;
}

const money = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });

const TIERS = ["BRONZE", "SILVER", "GOLD", "PLATINUM"] as const;

const TIER_STYLES: Record<string, string> = {
  BRONZE: "bg-amber-700/10 text-amber-700 dark:text-amber-500",
  SILVER: "bg-slate-400/15 text-slate-600 dark:text-slate-300",
  GOLD: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-500",
  PLATINUM: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
};

export function CustomersManager({
  customers,
  feedback,
  summary,
  total,
  page,
  pageSize,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const [customerDialog, setCustomerDialog] = useState<{ open: boolean; customer?: CustomerRow }>({
    open: false,
  });
  const [loyaltyDialog, setLoyaltyDialog] = useState<{ open: boolean; customer?: CustomerRow }>({
    open: false,
  });

  const activeTier = search.get("tier");
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(search.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    if (key !== "page") next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  };

  const removeCustomer = async (customer: CustomerRow) => {
    const name = `${customer.firstName} ${customer.lastName || ""}`.trim();
    if (!confirm(`Delete "${name}"? Order history is preserved.`)) return;
    const result = await deleteCustomerAction(customer.id);
    if (result.ok) {
      toast.success("Customer deleted");
      router.refresh();
    } else toast.error(result.error.message);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">
            Profiles, loyalty, and feedback across the organization
          </p>
        </div>
        <Button onClick={() => setCustomerDialog({ open: true })}>
          <Plus className="size-4" /> New customer
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Customers"
          value={String(summary.total)}
          hint={`${summary.optedIn} opted in to marketing`}
          icon={Users}
        />
        <StatTile
          label="Lifetime revenue"
          value={money.format(summary.totalSpent)}
          hint="All recorded customer spend"
          icon={Wallet}
        />
        <StatTile
          label="Points outstanding"
          value={summary.pointsOutstanding.toLocaleString()}
          hint="Unredeemed loyalty balance"
          icon={Gift}
        />
        <StatTile
          label="Birthdays soon"
          value={String(summary.birthdaysSoon)}
          hint="Within the next 30 days"
          icon={Cake}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, email, phone…"
            className="w-72 pl-8"
            defaultValue={search.get("search") ?? ""}
            onKeyDown={(e) => {
              if (e.key === "Enter") setParam("search", (e.target as HTMLInputElement).value);
            }}
          />
        </div>
        {TIERS.map((tier) => (
          <button
            key={tier}
            onClick={() => setParam("tier", activeTier === tier ? null : tier)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              activeTier === tier ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
            )}
          >
            {tier}
          </button>
        ))}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead className="text-right">Points</TableHead>
              <TableHead className="text-right">Visits</TableHead>
              <TableHead className="text-right">Lifetime spend</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  No customers match this view.
                </TableCell>
              </TableRow>
            )}
            {customers.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell className="font-medium">
                  {customer.firstName} {customer.lastName}
                  {customer.marketingOptIn && (
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      opt-in
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <div>{customer.phone || "—"}</div>
                  {customer.email && <div className="text-xs">{customer.email}</div>}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      TIER_STYLES[customer.loyaltyTier] ?? "bg-muted",
                    )}
                  >
                    {customer.loyaltyTier}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{customer.loyaltyPoints}</TableCell>
                <TableCell className="text-right tabular-nums">{customer.visitCount}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {money.format(customer.totalSpent)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {customer.tags.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[10px]">
                        {tag}
                      </Badge>
                    ))}
                    {customer.tags.length > 2 && (
                      <span className="text-xs text-muted-foreground">
                        +{customer.tags.length - 2}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Adjust loyalty"
                      onClick={() => setLoyaltyDialog({ open: true, customer })}
                    >
                      <Gift className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Edit"
                      onClick={() => setCustomerDialog({ open: true, customer })}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Delete"
                      onClick={() => removeCustomer(customer)}
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

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {pageCount} · {total} customers
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setParam("page", String(page - 1))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pageCount}
              onClick={() => setParam("page", String(page + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <FeedbackPanel feedback={feedback} openComplaints={summary.openComplaints} />

      <CustomerDialog
        open={customerDialog.open}
        customer={customerDialog.customer}
        onClose={() => setCustomerDialog({ open: false })}
      />
      <LoyaltyDialog
        open={loyaltyDialog.open}
        customer={loyaltyDialog.customer}
        onClose={() => setLoyaltyDialog({ open: false })}
      />
    </div>
  );
}
