"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2, Snowflake, PackageOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseMealLine } from "@/lib/planning/meal-parser";
import type { Diner, PlanMealWithRecipe, RecipeWithIngredients } from "@/lib/types";
import { RecipePicker } from "./recipe-picker";
import { deleteMeal, updateMeal } from "../actions";

export function MealRow({
  periodId,
  meal,
  recipes,
  diners,
}: {
  periodId: string;
  meal: PlanMealWithRecipe;
  recipes: RecipeWithIngredients[];
  diners: Diner[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [text, setText] = React.useState(meal.raw_text);

  const parsed = parseMealLine(text);
  const freezer = parsed.freezer_servings;

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        toast.error("Opslaan mislukt.");
        console.error(e);
      }
    });
  }

  function saveText() {
    if (text === meal.raw_text) return;
    run(() => updateMeal(periodId, meal.id, { raw_text: text }));
  }

  function toggleDiner(key: string) {
    const has = meal.diner_keys.includes(key);
    if (has && meal.diner_keys.length === 1) return; // keep at least one eater
    const next = has ? meal.diner_keys.filter((k) => k !== key) : [...meal.diner_keys, key];
    // Keep diner_count in sync so per-serving quantities also reflect who's eating
    // (e.g. "Amber 24u" -> only Robin -> buy for one).
    run(() => updateMeal(periodId, meal.id, { diner_keys: next, diner_count: next.length }));
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-2.5 transition-colors",
        meal.from_freezer && "border-sky-300/60 bg-sky-50/50 dark:border-sky-900/60 dark:bg-sky-950/20",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={saveText}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder="Wat eten we? bv. Wraps met ratatouille en ei + 2 potjes"
          className="h-9 flex-1 border-0 bg-transparent px-1.5 text-[0.95rem] font-medium shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        {freezer > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
            <Snowflake className="size-3" /> {freezer} {freezer === 1 ? "potje" : "potjes"}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          aria-label="Maaltijd verwijderen"
          onClick={() => run(() => deleteMeal(periodId, meal.id))}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-1.5">
        <RecipePicker
          recipes={recipes}
          value={meal.recipe_id}
          linkedTitle={meal.recipe?.title ?? null}
          onSelect={(id) => run(() => updateMeal(periodId, meal.id, { recipe_id: id }))}
        />

        <span className="mx-0.5 h-4 w-px bg-border" />

        {diners.map((d) => {
          const active = meal.diner_keys.includes(d.key);
          return (
            <button
              key={d.key}
              type="button"
              aria-pressed={active}
              onClick={() => toggleDiner(d.key)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                active
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground line-through opacity-70 hover:opacity-100",
              )}
              title={active ? `${d.label} eet mee` : `${d.label} eet niet mee`}
            >
              {d.label}
            </button>
          );
        })}

        <span className="mx-0.5 h-4 w-px bg-border" />

        <button
          type="button"
          aria-pressed={meal.from_freezer}
          onClick={() => run(() => updateMeal(periodId, meal.id, { from_freezer: !meal.from_freezer }))}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
            meal.from_freezer
              ? "border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300"
              : "border-dashed border-border text-muted-foreground hover:text-foreground",
          )}
          title="Eten we uit de diepvries? Dan hoeven we hiervoor niets te kopen."
        >
          <PackageOpen className="size-3.5" /> uit diepvries
        </button>
      </div>
    </div>
  );
}
