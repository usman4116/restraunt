import { z } from "zod";

export const orderLineSchema = z.object({
  menuItemId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  quantity: z.coerce.number().positive().max(999),
  notes: z.string().max(200).optional().or(z.literal("")),
});

export const placeOrderSchema = z
  .object({
    type: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY", "QR_ORDER"]),
    tableId: z.string().uuid().optional().nullable(),
    customerId: z.string().uuid().optional().nullable(),
    guestCount: z.coerce.number().int().positive().optional().nullable(),
    notes: z.string().max(500).optional().or(z.literal("")),
    lines: z.array(orderLineSchema).min(1, "Add at least one item"),
    discount: z
      .object({
        type: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
        value: z.coerce.number().positive(),
        label: z.string().max(60).default("Discount"),
      })
      .optional()
      .nullable(),
    tipAmount: z.coerce.number().min(0).default(0),
    payment: z
      .object({
        method: z.enum(["CASH", "CARD", "MOBILE_WALLET", "GIFT_CARD", "BANK_TRANSFER", "ONLINE"]),
        amount: z.coerce.number().positive(),
      })
      .optional()
      .nullable(),
    deliveryAddress: z.string().max(300).optional().or(z.literal("")),
    zoneId: z.string().uuid().optional().nullable(),
  })
  // Delivery.address is non-nullable in the schema, so a delivery order without
  // one would fail at the DB layer — reject it here where the message is useful.
  .refine((data) => data.type !== "DELIVERY" || (data.deliveryAddress ?? "").trim().length >= 5, {
    message: "Enter a delivery address",
    path: ["deliveryAddress"],
  });

export type PlaceOrderInput = z.output<typeof placeOrderSchema>;

export const ticketStatusSchema = z.object({
  ticketId: z.string().uuid(),
  status: z.enum(["NEW", "COOKING", "READY", "COMPLETED", "CANCELLED"]),
});

export interface OrderHistoryQuery {
  from?: string;
  to?: string;
  status?: string;
  type?: string;
  search?: string;
  page?: number;
}
