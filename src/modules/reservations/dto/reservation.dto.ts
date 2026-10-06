import { z } from "zod";

const optionalString = (max: number) => z.string().max(max).optional().or(z.literal(""));

export const RESERVATION_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "SEATED",
  "COMPLETED",
  "NO_SHOW",
  "CANCELLED",
] as const;

export const reservationSchema = z.object({
  guestName: z.string().min(1, "Guest name is required").max(120),
  guestPhone: optionalString(32),
  customerId: z.string().uuid().optional().or(z.literal("")),
  tableId: z.string().uuid().optional().or(z.literal("")),
  partySize: z.coerce.number().int().min(1, "At least one guest").max(200),
  // Local datetime from <input type="datetime-local">, e.g. "2026-08-05T19:30".
  reservedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time"),
  durationMin: z.coerce.number().int().min(15).max(600).default(90),
  notes: optionalString(500),
});

export const reservationStatusSchema = z.object({
  reservationId: z.string().uuid(),
  status: z.enum(RESERVATION_STATUSES),
});

export const tableSchema = z.object({
  sectionId: z.string().uuid("Pick a section"),
  name: z.string().min(1, "Table name is required").max(40),
  capacity: z.coerce.number().int().min(1).max(60).default(4),
});

export const sectionSchema = z.object({
  name: z.string().min(1, "Section name is required").max(60),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const tableStatusSchema = z.object({
  tableId: z.string().uuid(),
  tableStatus: z.enum(["AVAILABLE", "OCCUPIED", "RESERVED", "CLEANING", "OUT_OF_SERVICE"]),
});

export const reservationListQuerySchema = z.object({
  // Day to display, YYYY-MM-DD. Defaults to today in the service.
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: z.enum(RESERVATION_STATUSES).optional(),
  search: z.string().max(100).optional(),
});

export type ReservationInput = z.output<typeof reservationSchema>;
export type ReservationFormValues = z.input<typeof reservationSchema>;
export type ReservationStatusInput = z.output<typeof reservationStatusSchema>;
export type TableInput = z.output<typeof tableSchema>;
export type SectionInput = z.output<typeof sectionSchema>;
export type TableStatusInput = z.output<typeof tableStatusSchema>;
export type ReservationListQuery = z.output<typeof reservationListQuerySchema>;
