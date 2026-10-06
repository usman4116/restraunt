import { z } from "zod";

const optionalString = (max: number) => z.string().max(max).optional().or(z.literal(""));

export const DELIVERY_STATUSES = [
  "PENDING",
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
  "DELIVERED",
  "FAILED",
  "RETURNED",
] as const;

export const riderSchema = z.object({
  name: z.string().min(1, "Rider name is required").max(120),
  phone: z.string().min(1, "Phone is required").max(32),
  vehicleType: optionalString(40),
  vehicleNumber: optionalString(40),
  isAvailable: z.coerce.boolean().default(true),
});

export const zoneSchema = z.object({
  name: z.string().min(1, "Zone name is required").max(80),
  deliveryFee: z.coerce.number().min(0).max(100_000).default(0),
  minOrderAmount: z.coerce.number().min(0).max(1_000_000).default(0),
  etaMinutes: z.coerce.number().int().min(5).max(240).default(45),
});

export const assignRiderSchema = z.object({
  deliveryId: z.string().uuid(),
  riderId: z.string().uuid("Pick a rider"),
  riderEarning: z.coerce.number().min(0).max(100_000).default(0),
});

export const deliveryStatusSchema = z.object({
  deliveryId: z.string().uuid(),
  deliveryStatus: z.enum(DELIVERY_STATUSES),
});

/** Proof of delivery: the rider reads back the OTP the customer was given. */
export const confirmDeliverySchema = z.object({
  deliveryId: z.string().uuid(),
  otpCode: z
    .string()
    .regex(/^\d{4}$/, "Enter the 4-digit code"),
  proofImageUrl: optionalString(500),
});

export const deliveryListQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  deliveryStatus: z.enum(DELIVERY_STATUSES).optional(),
  riderId: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
});

export type RiderInput = z.output<typeof riderSchema>;
export type ZoneInput = z.output<typeof zoneSchema>;
export type AssignRiderInput = z.output<typeof assignRiderSchema>;
export type DeliveryStatusInput = z.output<typeof deliveryStatusSchema>;
export type ConfirmDeliveryInput = z.output<typeof confirmDeliverySchema>;
export type DeliveryListQuery = z.output<typeof deliveryListQuerySchema>;
