import { z } from "zod";

export const supplierSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  contactName: z.string().max(120).optional().or(z.literal("")),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  address: z.string().max(200).optional().or(z.literal("")),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(30),
});

export const purchaseOrderLineSchema = z.object({
  inventoryItemId: z.string().uuid("Pick an item"),
  quantity: z.coerce.number().positive("Quantity must be positive"),
  unitCost: z.coerce.number().min(0),
  taxRate: z.coerce.number().min(0).max(100).default(0),
});

export const purchaseOrderSchema = z.object({
  supplierId: z.string().uuid("Pick a supplier"),
  expectedDate: z.string().optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
  lines: z
    .array(purchaseOrderLineSchema)
    .min(1, "Add at least one line")
    .refine(
      (rows) => new Set(rows.map((r) => r.inventoryItemId)).size === rows.length,
      "Each item can only appear once",
    ),
});

export const receiveGoodsSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  notes: z.string().max(300).optional().or(z.literal("")),
  lines: z
    .array(
      z.object({
        purchaseOrderItemId: z.string().uuid(),
        receivedQty: z.coerce.number().min(0),
      }),
    )
    .min(1),
});

export type SupplierInput = z.output<typeof supplierSchema>;
export type SupplierFormValues = z.input<typeof supplierSchema>;
export type PurchaseOrderInput = z.output<typeof purchaseOrderSchema>;
export type ReceiveGoodsInput = z.output<typeof receiveGoodsSchema>;
