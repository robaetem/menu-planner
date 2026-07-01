import type { Ingredient, PlanDayWithMeals } from "@/lib/types";

// Aggregate every planned meal's ingredients into one shopping list.
//
//   servings_factor(meal) = diner_count + freezer_servings   (potjes = cook extra)
//   per_serving -> amount(or amount_max) * servings_factor
//   per_person  -> sum of amounts_per_person over the diners present, scaled by
//                  servings_factor / diner_count. A potje is an extra round of the
//                  diners present, so "+2 potjes" with 2 diners = one extra Robin +
//                  one extra Amber portion.
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
const UNIT_PLURAL: Record<string, string> = {
  koffielepel: "koffielepels",
  theelepel: "theelepels",
};

// Reconcile unit spellings so the same ingredient merges regardless of which
// write path produced it (the editor uses "gram"/"stuk"/…, older data may use
// "g"/"stuks"/…).
const UNIT_CANON: Record<string, string> = {
  g: "gram", gr: "gram", gram: "gram", grams: "gram", grammen: "gram",
  kg: "kg", kilo: "kg", kilogram: "kg",
  l: "l", liter: "l", liters: "l",
  ml: "ml", cl: "cl", dl: "dl",
  stuk: "stuk", stuks: "stuk", st: "stuk",
  koffielepel: "koffielepel", koffielepels: "koffielepel", kl: "koffielepel",
  theelepel: "theelepel", theelepels: "theelepel", tl: "theelepel",
};
export function normalizeUnit(unit: string): string {
  const v = (unit || "").trim().toLowerCase();
  return UNIT_CANON[v] ?? v;
}

function displayUnit(unit: string, amount: number): string {
  const normalized = normalizeUnit(unit);
  if (normalized in UNIT_PLURAL) return amount === 1 ? normalized : UNIT_PLURAL[normalized];
  return unit;
}

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
      const dinerCount = meal.diner_count || meal.diner_keys?.length || 0;
      const factor = dinerCount + (meal.freezer_servings || 0);
      // Potjes add extra rounds of the diners present: 2 diners + 2 potjes = 2 rounds.
      const potjeRounds = dinerCount > 0 ? factor / dinerCount : 1;
      for (const ig of ings) {
        if (ig.include_in_shopping === false) continue;
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
          add(ig.name, ig.unit, any ? sum * potjeRounds : null, ig.is_fresh, label);
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
  if (COUNTABLE.has(normalizeUnit(line.unit))) n = Math.ceil(n - 1e-9);
  else n = Math.round(n * 10) / 10;
  const s = Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
  return line.unit ? `${s} ${displayUnit(line.unit, n)}` : s;
}

export function formatProvenanceAmount(p: ShoppingProvenance, unit: string): string {
  if (p.amount == null) return "—";
  const n = Math.round(p.amount * 100) / 100;
  const s = Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
  return unit ? `${s} ${unit}` : s;
}
