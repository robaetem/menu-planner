import type { Ingredient, PlanMeal } from "@/lib/types";
import { serializeIngredient } from "@/lib/recipes/ingredient-parser";

type MealServingContext = Pick<
  PlanMeal,
  "diner_count" | "diner_keys" | "freezer_robin" | "freezer_amber"
>;

export type PlannedIngredientQuantity = {
  amount: number | null;
  amount_max: number | null;
};

/** Extra potjes to cook, keyed by the person each is portioned for. */
function freezerByDiner(meal: MealServingContext): Record<string, number> {
  return { robin: meal.freezer_robin || 0, amber: meal.freezer_amber || 0 };
}

/** Resolve the total quantity to prepare for everyone eating plus extra potjes. */
export function plannedIngredientQuantity(
  ingredient: Ingredient,
  meal: MealServingContext,
): PlannedIngredientQuantity {
  const dinerCount = meal.diner_count || meal.diner_keys?.length || 0;
  const freezer = freezerByDiner(meal);
  const freezerTotal = Object.values(freezer).reduce((a, b) => a + b, 0);
  const servingCount = dinerCount + freezerTotal;

  if (ingredient.scaling === "per_serving") {
    return {
      amount: ingredient.amount != null ? ingredient.amount * servingCount : null,
      amount_max: ingredient.amount_max != null ? ingredient.amount_max * servingCount : null,
    };
  }

  if (ingredient.scaling === "per_person") {
    let total = 0;
    let hasAmount = false;
    // Portions for whoever is eating today.
    for (const key of meal.diner_keys || []) {
      const amount = ingredient.amounts_per_person?.[key];
      if (amount != null) {
        total += Number(amount);
        hasAmount = true;
      }
    }
    // Extra potjes, each sized for the specific person it's cooked for — so a
    // Robin potje adds Robin's portion and an Amber potje adds Amber's.
    for (const [key, count] of Object.entries(freezer)) {
      if (!count) continue;
      const amount = ingredient.amounts_per_person?.[key];
      if (amount != null) {
        total += Number(amount) * count;
        hasAmount = true;
      }
    }
    return {
      amount: hasAmount ? total : null,
      amount_max: null,
    };
  }

  return {
    amount: ingredient.amount,
    amount_max: ingredient.amount_max,
  };
}

/** Format a planned total using the same Dutch ingredient syntax as recipes. */
export function serializePlannedIngredient(ingredient: Ingredient, meal: MealServingContext): string {
  const quantity = plannedIngredientQuantity(ingredient, meal);
  const adjusted: Ingredient = {
    ...ingredient,
    scaling: ingredient.scaling === "fixed" ? "fixed" : "per_serving",
    amount: quantity.amount,
    amount_max: quantity.amount_max,
    amounts_per_person: {},
  };
  return serializeIngredient(adjusted, 1);
}
