"use client";

import { Snowflake, Users, User, Leaf, Beef, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { serializePlannedIngredient } from "@/lib/planning/ingredient-quantity";
import { assigneeLabel, isVleesjeTemplate, resolveTitle } from "./config";
import type { Diner, PlanMealWithRecipe, RecipeWithIngredients } from "@/lib/types";

export function MealDetailDialog({
  meal,
  recipe,
  diners,
  open,
  onOpenChange,
  onPickVleesje,
}: {
  meal: PlanMealWithRecipe | null;
  recipe: RecipeWithIngredients | null;
  diners: Diner[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPickVleesje: () => void;
}) {
  if (!meal) return null;
  const baseTitle = recipe?.title ?? meal.freeform_title ?? meal.raw_text ?? "Maaltijd";
  const isTemplate = isVleesjeTemplate(recipe ?? { title: baseTitle });
  const title = isTemplate ? resolveTitle(baseTitle, meal.template_vleesjes) : baseTitle;
  const vleesjes = meal.template_vleesjes ?? [];
  const who = meal.assignee;
  const whoLabel =
    who === "both"
      ? `${diners.find((d) => d.key === "robin")?.label ?? "Robin"} & ${diners.find((d) => d.key === "amber")?.label ?? "Amber"}`
      : diners.find((d) => d.key === who)?.label ?? assigneeLabel(who);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-2 border-b px-6 py-5">
          <DialogTitle className="text-xl leading-tight">{title}</DialogTitle>
          <DialogDescription className="sr-only">Details voor {title}</DialogDescription>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              {who === "both" ? <Users className="size-4" /> : <User className="size-4" />} {whoLabel}
            </span>
            {meal.from_freezer && (
              <span className="inline-flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
                <Snowflake className="size-4" /> uit de diepvries
              </span>
            )}
            {!meal.from_freezer && meal.freezer_servings > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Snowflake className="size-4" /> +{meal.freezer_servings}{" "}
                {meal.freezer_servings === 1 ? "potje" : "potjes"} invriezen
              </span>
            )}
          </div>
          {recipe && recipe.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recipe.tags.map((t) => (
                <Badge key={t} variant="secondary" className="font-normal capitalize">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {isTemplate && (
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                  <Beef className="size-4 text-rose-500" /> Vleesje
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    onPickVleesje();
                  }}
                >
                  <Beef className="size-3.5" /> {vleesjes.length ? "Wijzig" : "Kies vleesje"}
                </Button>
              </div>
              {vleesjes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen vleesje gekozen.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {vleesjes.map((v, i) => (
                    <li key={`${v.name}-${i}`} className="flex items-center gap-2 px-3.5 py-2 text-sm">
                      {v.source === "freezer" ? (
                        <Snowflake className="size-3.5 text-sky-500" />
                      ) : (
                        <ShoppingCart className="size-3.5 text-amber-600" />
                      )}
                      <span className="flex-1">
                        {v.count}× {v.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {v.source === "freezer" ? "uit de diepvries" : "te kopen"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {meal.from_freezer ? (
            <p className="text-sm text-muted-foreground">
              Dit potje komt uit de diepvries — er hoeft niets voor gekocht te worden.
            </p>
          ) : recipe ? (
            <>
              <section>
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Ingrediënten</h3>
                {recipe.ingredients.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Geen ingrediënten toegevoegd.</p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {recipe.ingredients.map((ig) => (
                      <li key={ig.id} className="flex items-center justify-between gap-3 px-3.5 py-2 text-sm">
                        <span className="flex items-center gap-2">
                          {serializePlannedIngredient(ig, meal).replace(/^vast:\s*/, "")}
                          {ig.is_fresh && <Leaf className="size-3.5 text-primary" />}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {recipe.method && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Recept</h3>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{recipe.method}</p>
                </section>
              )}

              {recipe.notes && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Notities</h3>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{recipe.notes}</p>
                </section>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Vrije maaltijd zonder gekoppeld recept.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
