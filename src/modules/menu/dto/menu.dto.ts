import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  description: z.string().max(500).optional().or(z.literal("")),
  parentId: z.string().uuid().optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const menuItemSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  categoryId: z.string().uuid("Pick a category"),
  description: z.string().max(1000).optional().or(z.literal("")),
  sku: z.string().max(40).optional().or(z.literal("")),
  basePrice: z.coerce.number().min(0, "Price must be ≥ 0"),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  prepTimeMinutes: z.coerce.number().int().min(0).optional().nullable(),
  allergens: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  variants: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(60),
        priceDelta: z.coerce.number(),
        isDefault: z.boolean().default(false),
      }),
    )
    .default([]),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(100).optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  sort: z.string().max(40).default("-createdAt"),
});

export type CategoryInput = z.output<typeof categorySchema>;
export type CategoryFormValues = z.input<typeof categorySchema>;
export type MenuItemInput = z.output<typeof menuItemSchema>;
export type MenuItemFormValues = z.input<typeof menuItemSchema>;
export type ListQuery = z.output<typeof listQuerySchema>;
