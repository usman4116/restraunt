import { z } from "zod";

export const inventoryItemSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  sku: z.string().min(1, "SKU is required").max(40),
  categoryName: z.string().max(60).optional().or(z.literal("")),
  unit: z.string().min(1, "Unit is required").max(16),
  reorderLevel: z.coerce.number().min(0).default(0),
  reorderQty: z.coerce.number().min(0).default(0),
  lastCost: z.coerce.number().min(0).default(0),
  shelfLifeDays: z.coerce.number().int().min(0).optional().nullable(),
});

export const stockAdjustmentSchema = z.object({
  inventoryItemId: z.string().uuid(),
  type: z.enum(["ADJUSTMENT", "WASTE", "SPOILAGE"]),
  // Positive adds stock, negative removes. WASTE/SPOILAGE are always negative.
  quantity: z.coerce.number().refine((n) => n !== 0, "Quantity cannot be zero"),
  note: z.string().max(200).optional().or(z.literal("")),
});

export const inventoryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(100).optional(),
  lowStockOnly: z.coerce.boolean().default(false),
});

export type InventoryItemInput = z.output<typeof inventoryItemSchema>;
export type InventoryItemFormValues = z.input<typeof inventoryItemSchema>;
export type StockAdjustmentInput = z.output<typeof stockAdjustmentSchema>;
export type StockAdjustmentFormValues = z.input<typeof stockAdjustmentSchema>;
export type InventoryListQuery = z.output<typeof inventoryListQuerySchema>;
