"use client";

import * as React from "react";
import { toast } from "sonner";
import { Copy, ShoppingCart } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { computeShoppingList, formatQuantity } from "@/lib/planning/shopping";
import type { PlanDayWithMeals, RecipeWithIngredients } from "@/lib/types";

export function ShoppingSheet({
  open,
  onOpenChange,
  days,
  recipes,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  days: PlanDayWithMeals[];
  recipes: RecipeWithIngredients[];
}) {
  const ingredientsByRecipe = React.useMemo(
    () => Object.fromEntries(recipes.map((r) => [r.id, r.ingredients])),
    [recipes],
  );
  const result = React.useMemo(
    () => computeShoppingList(days, ingredientsByRecipe),
    [days, ingredientsByRecipe],
  );
  const lines = result.all;

  // Check-off state persists per day-selection (on this device).
  const storageKey = React.useMemo(
    () => "menuplanner:shop:" + days.map((d) => d.day_date).sort().join(","),
    [days],
  );
  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  React.useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(storageKey);
      setChecked(raw ? new Set(JSON.parse(raw)) : new Set());
    } catch {
      setChecked(new Set());
    }
  }, [storageKey, open]);

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function copy() {
    const text = lines
      .map((l) => {
        const q = formatQuantity(l);
        return `- ${q ? q + " " : ""}${l.name}`;
      })
      .join("\n");
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast.success("Boodschappenlijstje gekopieerd"),
        () => toast.error("Kopiëren mislukt"),
      );
    }
  }

  const remaining = lines.filter((l) => !checked.has(l.key)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4">
          <DialogTitle>Boodschappenlijstje</DialogTitle>
          <DialogDescription>
            {days.length} {days.length === 1 ? "dag" : "dagen"} · {result.mealsCounted}{" "}
            {result.mealsCounted === 1 ? "maaltijd" : "maaltijden"}
            {lines.length > 0 && ` · ${remaining}/${lines.length} te kopen`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {lines.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                <ShoppingCart className="size-6" />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Geen ingrediënten — koppel recepten (Gerecht) aan de geselecteerde dagen.
              </p>
            </div>
          ) : (
            <ul>
              {lines.map((l) => {
                const isChecked = checked.has(l.key);
                const q = formatQuantity(l);
                return (
                  <li key={l.key}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50">
                      <Checkbox checked={isChecked} onCheckedChange={() => toggle(l.key)} aria-label={l.name} />
                      <span
                        className={cn(
                          "flex flex-1 items-baseline gap-2 text-sm",
                          isChecked && "text-muted-foreground line-through",
                        )}
                      >
                        {q && <span className="min-w-16 font-medium tabular-nums">{q}</span>}
                        <span className={cn(!q && "font-medium")}>{l.name}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t px-6 py-3">
          <Button variant="outline" className="w-full" onClick={copy} disabled={!lines.length}>
            <Copy className="size-4" /> Kopieer lijst
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
