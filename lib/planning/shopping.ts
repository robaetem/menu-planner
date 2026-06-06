import type { Ingredient, PlanDayWithMeals } from "@/lib/types";

// Aggregate every planned meal's ingredients into one shopping list.
//
//   servings_factor(meal) = diner_count + freezer_servings   (potjes = cook extra)
//   per_serving -> amount(or amount_max) * servings_factor
//   per_person  -> sum of amounts_per_person over the diners actually present
//                  (potjes ignored — you don't freeze portioned meat)
//   fixed       -> amount(or amount_max) once per meal
//   from_freezer / unlinked meals contribute nothing.
// Lines merge by (lower(name), lower(unit)); amount_max ("800-1000 g") is used so
// we never under-buy.

export type ShoppingProvenance = { meal: string; amount: number | null };
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

const COUNTABLE = new Set(["stuk", "blik", "teen", "bos", "pak", "zak", "snee", "plak", "pot", "bol"]);

export function lineKey(name: string, unit: string): string {
  return `${name.trim().toLowerCase()}|${unit.trim().toLowerCase()}`;
}

export function computeShoppingList(
  days: PlanDayWithMeals[],
  ingredientsByRecipe: Record<string, Ingredient[]>,
): ShoppingResult {
  const map = new Map<string, ShoppingLine>();
  let mealsCounted = 0;
  let mealsFromFreezer = 0;
  const unlinkedMeals: string[] = [];

  const add = (name: string, unit: string, amount: number | null, isFresh: boolean, mealLabel: string) => {
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
    line.provenance.push({ meal: mealLabel, amount });
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
      const factor = (meal.diner_count || 0) + (meal.freezer_servings || 0);
      for (const ig of ings) {
        const a = ig.amount_max ?? ig.amount;
        if (ig.scaling === "per_serving") {
          add(ig.name, ig.unit, a != null ? a * factor : null, ig.is_fresh, label);
        } else if (ig.scaling === "per_person") {
          let sum = 0;
          let any = false;
          for (const k of meal.diner_keys || []) {
            const v = ig.amounts_per_person?.[k];
            if (v != null) {
              sum += Number(v);
              any = true;
            }
          }
          add(ig.name, ig.unit, any ? sum : null, ig.is_fresh, label);
        } else {
          add(ig.name, ig.unit, a, ig.is_fresh, label);
        }
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
  if (COUNTABLE.has(line.unit.toLowerCase())) n = Math.ceil(n - 1e-9);
  else n = Math.round(n * 10) / 10;
  const s = Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
  return line.unit ? `${s} ${line.unit}` : s;
}

export function formatProvenanceAmount(p: ShoppingProvenance, unit: string): string {
  if (p.amount == null) return "—";
  const n = Math.round(p.amount * 100) / 100;
  const s = Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
  return unit ? `${s} ${unit}` : s;
}
