import { z } from "zod";

export const recipeIngredientSchema = z.object({
  inventoryItemId: z.string().uuid("Pick an ingredient"),
  quantity: z.coerce.number().positive("Quantity must be positive"),
  wastePercent: z.coerce.number().min(0).max(100).default(0),
});

export const recipeSchema = z.object({
  menuItemId: z.string().uuid(),
  yieldQty: z.coerce.number().positive().default(1),
  servingSize: z.string().max(60).optional().or(z.literal("")),
  prepMinutes: z.coerce.number().int().min(0).optional().nullable(),
  cookMinutes: z.coerce.number().int().min(0).optional().nullable(),
  instructions: z.array(z.string().max(500)).default([]),
  ingredients: z
    .array(recipeIngredientSchema)
    .min(1, "Add at least one ingredient")
    .refine(
      (rows) => new Set(rows.map((r) => r.inventoryItemId)).size === rows.length,
      "Each ingredient can only appear once",
    ),
});

export type RecipeInput = z.output<typeof recipeSchema>;
export type RecipeIngredientInput = z.output<typeof recipeIngredientSchema>;
