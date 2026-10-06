import { z } from "zod";

const optionalString = (max: number) => z.string().max(max).optional().or(z.literal(""));

export const customerSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(80),
  lastName: optionalString(80),
  email: z.string().email("Invalid email").max(160).optional().or(z.literal("")),
  phone: optionalString(32),
  // Date-only string, kept as text so the browser <input type="date"> round-trips cleanly.
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional().or(z.literal("")),
  address: optionalString(240),
  notes: optionalString(500),
  tags: z.array(z.string().max(30)).max(12).default([]),
  marketingOptIn: z.coerce.boolean().default(false),
});

export const loyaltyAdjustSchema = z.object({
  customerId: z.string().uuid(),
  type: z.enum(["EARN", "REDEEM", "ADJUST"]),
  points: z.coerce.number().int().refine((n) => n !== 0, "Points cannot be zero"),
  note: optionalString(200),
});

export const feedbackResolveSchema = z.object({
  feedbackId: z.string().uuid(),
});

export const customerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(100).optional(),
  tier: z.enum(["BRONZE", "SILVER", "GOLD", "PLATINUM"]).optional(),
});

export type CustomerInput = z.output<typeof customerSchema>;
export type CustomerFormValues = z.input<typeof customerSchema>;
export type LoyaltyAdjustInput = z.output<typeof loyaltyAdjustSchema>;
export type CustomerListQuery = z.output<typeof customerListQuerySchema>;
