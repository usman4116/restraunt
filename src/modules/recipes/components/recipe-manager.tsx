"use client";

import { useState } from "react";
import { BookOpen, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { RecipeDialog, type IngredientOption } from "./recipe-dialog";

export interface RecipeRow {
  menuItemId: string;
  name: string;
  categoryName: string | null;
  basePrice: number;
  recipeId: string | null;
  version: number | null;
  ingredientCount: number;
  costPerServing: number | null;
  marginPercent: number | null;
}

interface Props {
  rows: RecipeRow[];
  ingredients: IngredientOption[];
}

const money = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });

export function RecipeManager({ rows, ingredients }: Props) {
  const [dialog, setDialog] = useState<{ open: boolean; row?: RecipeRow }>({ open: false });

  const withRecipe = rows.filter((r) => r.recipeId).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recipes</h1>
          <p className="text-sm text-muted-foreground">
            {withRecipe} of {rows.length} menu items have a recipe. Completed orders
            automatically deduct recipe ingredients from stock.
          </p>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Menu item</TableHead>
              <TableHead>Recipe</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Food cost</TableHead>
              <TableHead className="text-right">Margin</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  No active menu items. Create menu items first.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.menuItemId}>
                <TableCell className="font-medium">
                  {row.name}
                  {row.categoryName && (
                    <span className="ml-2 text-xs text-muted-foreground">{row.categoryName}</span>
                  )}
                </TableCell>
                <TableCell>
                  {row.recipeId ? (
                    <Badge variant="secondary" className="gap-1">
                      <BookOpen className="size-3" />
                      v{row.version} · {row.ingredientCount} ingredients
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{money.format(row.basePrice)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.costPerServing !== null ? money.format(row.costPerServing) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.marginPercent !== null ? (
                    <span
                      className={cn(
                        row.marginPercent < 50 && "text-destructive",
                        row.marginPercent >= 70 && "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {row.marginPercent}%
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDialog({ open: true, row })}
                    >
                      {row.recipeId ? <Pencil className="size-4" /> : <Plus className="size-4" />}
                      {row.recipeId ? "Edit" : "Add recipe"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <RecipeDialog
        open={dialog.open}
        row={dialog.row}
        ingredients={ingredients}
        onClose={() => setDialog({ open: false })}
      />
    </div>
  );
}
