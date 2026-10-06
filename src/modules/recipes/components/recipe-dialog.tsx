"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getRecipeAction, saveRecipeAction } from "../actions/recipe.actions";
import type { RecipeRow } from "./recipe-manager";

export interface IngredientOption {
  id: string;
  name: string;
  unit: string;
  avgCost: number;
}

interface IngredientRowState {
  inventoryItemId: string;
  quantity: string;
  wastePercent: string;
}

interface Props {
  open: boolean;
  row?: RecipeRow;
  ingredients: IngredientOption[];
  onClose: () => void;
}

const money = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });
const emptyRow = (): IngredientRowState => ({ inventoryItemId: "", quantity: "", wastePercent: "0" });

export function RecipeDialog({ open, row, ingredients, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Recipe — {row?.name}
            {row?.version ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                editing creates v{row.version + 1}
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>
        {open && row && <RecipeForm row={row} ingredients={ingredients} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

// Mounted fresh per dialog open — initial state comes from props/fetch, no reset effect.
function RecipeForm({
  row,
  ingredients,
  onClose,
}: {
  row: RecipeRow;
  ingredients: IngredientOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(Boolean(row.recipeId));

  const [yieldQty, setYieldQty] = useState("1");
  const [prepMinutes, setPrepMinutes] = useState("");
  const [cookMinutes, setCookMinutes] = useState("");
  const [rows, setRows] = useState<IngredientRowState[]>([emptyRow()]);

  const optionById = new Map(ingredients.map((i) => [i.id, i]));

  useEffect(() => {
    if (!row.recipeId) return;
    let cancelled = false;
    getRecipeAction(row.menuItemId)
      .then((result) => {
        if (cancelled || !result.ok || !result.data) return;
        setYieldQty(String(result.data.yieldQty));
        setPrepMinutes(result.data.prepMinutes != null ? String(result.data.prepMinutes) : "");
        setCookMinutes(result.data.cookMinutes != null ? String(result.data.cookMinutes) : "");
        setRows(
          result.data.ingredients.map((ing) => ({
            inventoryItemId: ing.inventoryItemId,
            quantity: String(ing.quantity),
            wastePercent: String(ing.wastePercent),
          })),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [row.recipeId, row.menuItemId]);

  const setRow = (index: number, patch: Partial<IngredientRowState>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const liveFoodCost = rows.reduce((sum, r) => {
    const opt = optionById.get(r.inventoryItemId);
    if (!opt) return sum;
    const qty = Number(r.quantity) || 0;
    const waste = Number(r.wastePercent) || 0;
    return sum + qty * (1 + waste / 100) * opt.avgCost;
  }, 0);
  const perServing = liveFoodCost / (Number(yieldQty) || 1);
  const margin =
    row.basePrice > 0 ? Math.round(((row.basePrice - perServing) / row.basePrice) * 1000) / 10 : null;

  const submit = () =>
    startTransition(async () => {
      const result = await saveRecipeAction({
        menuItemId: row.menuItemId,
        yieldQty: Number(yieldQty) || 1,
        prepMinutes: prepMinutes === "" ? null : Number(prepMinutes),
        cookMinutes: cookMinutes === "" ? null : Number(cookMinutes),
        instructions: [],
        ingredients: rows
          .filter((r) => r.inventoryItemId)
          .map((r) => ({
            inventoryItemId: r.inventoryItemId,
            quantity: Number(r.quantity),
            wastePercent: Number(r.wastePercent) || 0,
          })),
      });
      if (result.ok) {
        toast.success(`Recipe saved (v${result.data.version})`);
        onClose();
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label htmlFor="rec-yield">Yield (servings)</Label>
            <Input
              id="rec-yield" type="number" step="0.5" min="0.5"
              value={yieldQty} onChange={(e) => setYieldQty(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rec-prep">Prep (min)</Label>
            <Input
              id="rec-prep" type="number" min="0"
              value={prepMinutes} onChange={(e) => setPrepMinutes(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rec-cook">Cook (min)</Label>
            <Input
              id="rec-cook" type="number" min="0"
              value={cookMinutes} onChange={(e) => setCookMinutes(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Ingredients</Label>
            <Button
              type="button" variant="outline" size="sm"
              onClick={() => setRows((prev) => [...prev, emptyRow()])}
            >
              <Plus className="size-4" /> Add ingredient
            </Button>
          </div>
          <div className="space-y-2">
            {rows.map((r, i) => {
              const opt = optionById.get(r.inventoryItemId);
              return (
                <div key={i} className="grid grid-cols-[1fr_110px_90px_90px_36px] items-center gap-2">
                  <select
                    aria-label="Ingredient"
                    className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
                    value={r.inventoryItemId}
                    onChange={(e) => setRow(i, { inventoryItemId: e.target.value })}
                  >
                    <option value="">Select ingredient…</option>
                    {ingredients.map((ing) => (
                      <option key={ing.id} value={ing.id}>
                        {ing.name} ({ing.unit})
                      </option>
                    ))}
                  </select>
                  <Input
                    aria-label="Quantity" type="number" step="0.001" min="0"
                    placeholder={opt ? `Qty (${opt.unit})` : "Qty"}
                    value={r.quantity}
                    onChange={(e) => setRow(i, { quantity: e.target.value })}
                  />
                  <Input
                    aria-label="Waste %" type="number" step="1" min="0" max="100"
                    placeholder="Waste %"
                    value={r.wastePercent}
                    onChange={(e) => setRow(i, { wastePercent: e.target.value })}
                  />
                  <span className="text-right text-sm tabular-nums text-muted-foreground">
                    {opt && Number(r.quantity) > 0
                      ? money.format(
                          Number(r.quantity) * (1 + (Number(r.wastePercent) || 0) / 100) * opt.avgCost,
                        )
                      : "—"}
                  </span>
                  <Button
                    type="button" variant="ghost" size="icon" aria-label="Remove ingredient"
                    className="text-destructive"
                    onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            Food cost {money.format(liveFoodCost)} · per serving {money.format(perServing || 0)}
          </span>
          {margin !== null && (
            <span className={margin < 50 ? "font-medium text-destructive" : "font-medium"}>
              Margin {margin}%
            </span>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          onClick={submit}
          disabled={pending || !rows.some((r) => r.inventoryItemId && Number(r.quantity) > 0)}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save recipe
        </Button>
      </DialogFooter>
    </>
  );
}
