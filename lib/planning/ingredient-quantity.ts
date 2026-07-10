import type { Ingredient, PlanMeal } from "@/lib/types";
import { serializeIngredient } from "@/lib/recipes/ingredient-parser";

type MealServingContext = Pick<PlanMeal, "diner_count" | "diner_keys" | "freezer_servings">;

export type PlannedIngredientQuantity = {
  amount: number | null;
  amount_max: number | null;
};

/** Resolve the total quantity to prepare for everyone eating plus extra potjes. */
export function plannedIngredientQuantity(
  ingredient: Ingredient,
  meal: MealServingContext,
): PlannedIngredientQuantity {
  const dinerCount = meal.diner_count || meal.diner_keys?.length || 0;
  const servingCount = dinerCount + (meal.freezer_servings || 0);

  if (ingredient.scaling === "per_serving") {
    return {
      amount: ingredient.amount != null ? ingredient.amount * servingCount : null,
      amount_max: ingredient.amount_max != null ? ingredient.amount_max * servingCount : null,
    };
  }

  if (ingredient.scaling === "per_person") {
    let selectedTotal = 0;
    let hasAmount = false;
    for (const key of meal.diner_keys || []) {
      const amount = ingredient.amounts_per_person?.[key];
      if (amount != null) {
        selectedTotal += Number(amount);
        hasAmount = true;
      }
    }
    const potjeRounds = dinerCount > 0 ? servingCount / dinerCount : 1;
    return {
      amount: hasAmount ? selectedTotal * potjeRounds : null,
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
