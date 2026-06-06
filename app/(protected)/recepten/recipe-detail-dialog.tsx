"use client";

import { Clock, Leaf, Snowflake, Pencil, Trash2, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { serializeIngredient } from "@/lib/recipes/ingredient-parser";
import type { Ingredient, RecipeWithIngredients } from "@/lib/types";

function modeBadge(ig: Ingredient) {
  if (ig.scaling === "per_person")
    return <Badge variant="outline" className="text-violet-600 dark:text-violet-400">per persoon</Badge>;
  if (ig.scaling === "fixed")
    return <Badge variant="outline" className="text-amber-600 dark:text-amber-400">vast</Badge>;
  return null;
}

export function RecipeDetailDialog({
  recipe,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: {
  recipe: RecipeWithIngredients | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (!recipe) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 space-y-3 border-b px-6 py-5">
          <DialogTitle className="text-xl leading-tight">{recipe.title}</DialogTitle>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            {recipe.prep_minutes != null && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4" /> {recipe.prep_minutes} min
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-4" /> basis {recipe.base_servings} pers.
            </span>
            {recipe.uses_fresh_veg && (
              <span className="inline-flex items-center gap-1.5 text-primary">
                <Leaf className="size-4" /> verse groenten
              </span>
            )}
            {recipe.freezer_friendly && (
              <span className="inline-flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
                <Snowflake className="size-4" /> diepvries
              </span>
            )}
          </div>
          {recipe.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recipe.tags.map((t) => (
                <Badge key={t} variant="secondary" className="font-normal">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
              Ingrediënten <span className="font-normal">(voor {recipe.base_servings} personen)</span>
            </h3>
            {recipe.ingredients.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen ingrediënten toegevoegd.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {recipe.ingredients.map((ig) => (
                  <li key={ig.id} className="flex items-center justify-between gap-3 px-3.5 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      {serializeIngredient(ig, recipe.base_servings).replace(/^vast:\s*/, "")}
                      {ig.is_fresh && <Leaf className="size-3.5 text-primary" />}
                    </span>
                    {modeBadge(ig)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {recipe.method && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Bereiding</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{recipe.method}</p>
            </section>
          )}

          {recipe.notes && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Notities</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{recipe.notes}</p>
            </section>
          )}

          <p className="text-xs text-muted-foreground">
            {recipe.cook_count > 0 ? `${recipe.cook_count}× gemaakt` : "Nog niet gemaakt"}
          </p>
        </div>

        <DialogFooter className="shrink-0 justify-between gap-2 border-t px-6 py-4 sm:justify-between">
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="size-4" /> Verwijderen
          </Button>
          <Button onClick={onEdit}>
            <Pencil className="size-4" /> Bewerken
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
