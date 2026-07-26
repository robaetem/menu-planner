import type { Ingredient, PlanDayWithMeals } from "@/lib/types";
import { plannedIngredientQuantity } from "@/lib/planning/ingredient-quantity";
import { COUNTABLE, displayUnit, normalizeUnit } from "@/lib/planning/units";

// Aggregate every planned meal's ingredients into one shopping list.
//
//   servings_factor(meal) = diner_count + freezer_robin + freezer_amber
//   per_serving -> amount(or amount_max) * servings_factor
//   per_person  -> sum of amounts_per_person over the diners present, PLUS each
//                  extra potje sized for the person it's cooked for (a Robin potje
//                  adds Robin's portion, an Amber potje adds Amber's).
//   fixed       -> amount(or amount_max) once per meal
//   from_freezer / unlinked meals contribute nothing.
// Lines merge by (lower(name), lower(unit)); amount_max ("800-1000 g") is used so
// we never under-buy.

/** Where one contribution to a shopping line came from: which planned meal, on
 *  which day, and how much of the line that meal accounts for. */
export type ShoppingProvenance = {
  meal: string;
  amount: number | null;
  /** ISO day (yyyy-mm-dd) the meal is planned on; "" when unknown. */
  date: string;
  assignee: string | null;
};
export type ShoppingLine = {
  key: string; // `${lower(name)}|${lower(unit)}` — stable check-off key
  name: string;
  unit: string;
  total: number | null;
  hasNumeric: boolean;
  is_fresh: boolean;
  provenance: ShoppingProvenance[];
};
export type ShoppingResult = {
  fresh: ShoppingLine[];
  pantry: ShoppingLine[];
  all: ShoppingLine[];
  mealsCounted: number;
  mealsFromFreezer: number;
  unlinkedMeals: string[];
};

export { normalizeUnit };

export function lineKey(name: string, unit: string): string {
  return `${name.trim().toLowerCase()}|${normalizeUnit(unit)}`;
}

export function computeShoppingList(
  days: PlanDayWithMeals[],
  ingredientsByRecipe: Record<string, Ingredient[]>,
): ShoppingResult {
  const map = new Map<string, ShoppingLine>();
  let mealsCounted = 0;
  let mealsFromFreezer = 0;
  const unlinkedMeals: string[] = [];

  const add = (
    name: string,
    unit: string,
    amount: number | null,
    isFresh: boolean,
    origin: ShoppingProvenance,
  ) => {
    const nm = (name || "").trim();
    if (!nm) return;
    const un = (unit || "").trim();
    const key = lineKey(nm, un);
    let line = map.get(key);
    if (!line) {
      line = { key, name: nm, unit: un, total: 0, hasNumeric: false, is_fresh: false, provenance: [] };
      map.set(key, line);
    }
    line.is_fresh = line.is_fresh || isFresh;
    if (amount != null) {
      line.total = (line.total ?? 0) + amount;
      line.hasNumeric = true;
    }
    line.provenance.push(origin);
  };

  for (const day of days) {
    for (const meal of day.meals) {
      const label = meal.recipe?.title || meal.freeform_title || meal.raw_text || "Maaltijd";
      if (meal.from_freezer) {
        mealsFromFreezer++;
        continue;
      }
      if (!meal.recipe_id || !meal.recipe) {
        const hasText = !!(meal.raw_text?.trim() || meal.freeform_title?.trim());
        if (hasText) unlinkedMeals.push(label);
        continue;
      }
      const ings = ingredientsByRecipe[meal.recipe_id] || [];
      mealsCounted++;
      for (const ig of ings) {
        if (ig.include_in_shopping === false) continue;
        const quantity = plannedIngredientQuantity(ig, meal);
        const amount = quantity.amount_max ?? quantity.amount;
        add(ig.name, ig.unit, amount, ig.is_fresh, {
          meal: label,
          amount,
          date: day.day_date || "",
          assignee: meal.assignee ?? null,
        });
      }
    }
  }

  const all = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "nl"));
  return {
    fresh: all.filter((l) => l.is_fresh),
    pantry: all.filter((l) => !l.is_fresh),
    all,
    mealsCounted,
    mealsFromFreezer,
    unlinkedMeals,
  };
}

export function formatQuantity(line: Pick<ShoppingLine, "total" | "unit" | "hasNumeric">): string {
  if (!line.hasNumeric || line.total == null) return "";
  let n = line.total;
  if (COUNTABLE.has(normalizeUnit(line.unit))) n = Math.ceil(n - 1e-9);
  else n = Math.round(n * 10) / 10;
  const s = Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
  return line.unit ? `${s} ${displayUnit(line.unit, n)}` : s;
}

// A single meal's share is NOT rounded up the way the buy-total is: the parts
// have to keep adding up to (at most) the total shown on the line.
export function formatProvenanceAmount(p: Pick<ShoppingProvenance, "amount">, unit: string): string {
  if (p.amount == null) return "—";
  const n = Math.round(p.amount * 100) / 100;
  const s = Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
  return unit ? `${s} ${displayUnit(unit, n)}` : s;
}
