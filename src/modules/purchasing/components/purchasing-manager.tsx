"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Check, X, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  approvePurchaseOrderAction,
  cancelPurchaseOrderAction,
  deleteSupplierAction,
} from "../actions/purchasing.actions";
import { PurchaseOrderDialog } from "./purchase-order-dialog";
import { ReceiveGoodsDialog } from "./receive-goods-dialog";
import { SupplierDialog } from "./supplier-dialog";

export interface PoLineRow {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  receivedQty: number;
  unitCost: number;
}

export interface PoRow {
  id: string;
  poNumber: string;
  supplierName: string;
  poStatus: string;
  expectedDate: string | null;
  totalAmount: number;
  createdAt: string;
  items: PoLineRow[];
}

export interface SupplierRow {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  paymentTermsDays: number;
  orderCount: number;
}

export interface ItemOption {
  id: string;
  name: string;
  unit: string;
  lastCost: number;
}

interface Props {
  orders: PoRow[];
  suppliers: SupplierRow[];
  items: ItemOption[];
}

const money = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  DRAFT: { label: "Draft", variant: "outline" },
  PENDING_APPROVAL: { label: "Pending approval", variant: "outline" },
  APPROVED: { label: "Approved", variant: "secondary" },
  SENT: { label: "Sent", variant: "secondary" },
  PARTIALLY_RECEIVED: { label: "Partially received", variant: "secondary" },
  RECEIVED: { label: "Received", variant: "default" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
  CLOSED: { label: "Closed", variant: "outline" },
};

export function PurchasingManager({ orders, suppliers, items }: Props) {
  const router = useRouter();
  const [poDialog, setPoDialog] = useState(false);
  const [receiveDialog, setReceiveDialog] = useState<{ open: boolean; po?: PoRow }>({ open: false });
  const [supplierDialog, setSupplierDialog] = useState<{ open: boolean; supplier?: SupplierRow }>({ open: false });

  const act = async (fn: () => Promise<{ ok: boolean; error?: { message: string } }>, success: string) => {
    const result = await fn();
    if (result.ok) {
      toast.success(success);
      router.refresh();
    } else toast.error(result.error?.message ?? "Something went wrong");
  };

  const openTotal = orders
    .filter((po) => ["PENDING_APPROVAL", "APPROVED", "SENT", "PARTIALLY_RECEIVED"].includes(po.poStatus))
    .reduce((sum, po) => sum + po.totalAmount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Purchasing</h1>
          <p className="text-sm text-muted-foreground">
            {orders.length} purchase orders · {money.format(openTotal)} open · {suppliers.length} suppliers
          </p>
        </div>
      </div>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Purchase orders</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setPoDialog(true)} disabled={suppliers.length === 0}>
              <Plus className="size-4" /> New purchase order
            </Button>
          </div>
          {suppliers.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Add a supplier first to create purchase orders.
            </p>
          )}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      No purchase orders yet.
                    </TableCell>
                  </TableRow>
                )}
                {orders.map((po) => {
                  const badge = STATUS_BADGE[po.poStatus] ?? { label: po.poStatus, variant: "outline" as const };
                  const receivable = ["APPROVED", "SENT", "PARTIALLY_RECEIVED"].includes(po.poStatus);
                  const approvable = ["DRAFT", "PENDING_APPROVAL"].includes(po.poStatus);
                  return (
                    <TableRow key={po.id}>
                      <TableCell className="font-medium">{po.poNumber}</TableCell>
                      <TableCell>{po.supplierName}</TableCell>
                      <TableCell className="max-w-64 truncate text-muted-foreground">
                        {po.items.map((l) => `${l.quantity} ${l.unit} ${l.name}`).join(", ")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money.format(po.totalAmount)}</TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {approvable && (
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => act(() => approvePurchaseOrderAction(po.id), "Order approved")}
                            >
                              <Check className="size-4" /> Approve
                            </Button>
                          )}
                          {receivable && (
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => setReceiveDialog({ open: true, po })}
                            >
                              <PackageCheck className="size-4" /> Receive
                            </Button>
                          )}
                          {(approvable || po.poStatus === "APPROVED" || po.poStatus === "SENT") && (
                            <Button
                              variant="ghost" size="icon" aria-label="Cancel order" className="text-destructive"
                              onClick={() => {
                                if (confirm(`Cancel ${po.poNumber}?`)) {
                                  act(() => cancelPurchaseOrderAction(po.id), "Order cancelled");
                                }
                              }}
                            >
                              <X className="size-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setSupplierDialog({ open: true })}>
              <Plus className="size-4" /> New supplier
            </Button>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Terms</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      No suppliers yet.
                    </TableCell>
                  </TableRow>
                )}
                {suppliers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {s.name}
                      {s.email && <span className="ml-2 text-xs text-muted-foreground">{s.email}</span>}
                    </TableCell>
                    <TableCell>{s.contactName ?? "—"}</TableCell>
                    <TableCell>{s.phone ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">Net {s.paymentTermsDays}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.orderCount}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost" size="icon" aria-label="Edit"
                          onClick={() => setSupplierDialog({ open: true, supplier: s })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" aria-label="Delete" className="text-destructive"
                          onClick={() => {
                            if (confirm(`Delete "${s.name}"?`)) {
                              act(() => deleteSupplierAction(s.id), "Supplier deleted");
                            }
                          }}
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
      </Tabs>

      <PurchaseOrderDialog
        open={poDialog}
        suppliers={suppliers}
        items={items}
        onClose={() => setPoDialog(false)}
      />
      <ReceiveGoodsDialog
        open={receiveDialog.open}
        po={receiveDialog.po}
        onClose={() => setReceiveDialog({ open: false })}
      />
      <SupplierDialog
        open={supplierDialog.open}
        supplier={supplierDialog.supplier}
        onClose={() => setSupplierDialog({ open: false })}
      />
    </div>
  );
}
