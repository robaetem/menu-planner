// Shared domain types for the Menu Planner (mirror the Supabase schema).

export type Diner = { key: string; label: string };

export type Household = {
  id: string;
  name: string;
  diners: Diner[];
  default_people: number;
  plan_horizon: string | null;
  created_at: string;
};

export type ScalingMode = "per_serving" | "per_person" | "fixed";

export type Ingredient = {
  id: string;
  recipe_id: string;
  name: string;
  unit: string;
  scaling: ScalingMode;
  /** For per_serving this is the quantity for ONE serving (normalized by base_servings on save). */
  amount: number | null;
  amount_max: number | null;
  amounts_per_person: Record<string, number>;
  is_fresh: boolean;
  sort: number;
};

export type Recipe = {
  id: string;
  title: string;
  tags: string[];
  prep_minutes: number | null;
  uses_fresh_veg: boolean;
  freezer_friendly: boolean;
  base_servings: number;
  method: string | null;
  notes: string | null;
  cook_count: number;
  last_cooked_on: string | null;
  created_at: string;
  updated_at: string;
};

export type RecipeWithIngredients = Recipe & { ingredients: Ingredient[] };

/** Who a meal is for: Samen (both, full-width) or a single person (half-width). */
export type Assignee = "both" | "amber" | "robin";

export type PlanMeal = {
  id: string;
  plan_day_id: string;
  recipe_id: string | null;
  assignee: Assignee;
  raw_text: string;
  freeform_title: string | null;
  cook: string | null;
  diner_count: number;
  diner_keys: string[];
  freezer_servings: number;
  from_freezer: boolean; // true = "Potje diepvries" (blue, eat from stock)
  note: string | null;
  sort: number;
};

export type PlanMealWithRecipe = PlanMeal & { recipe: Recipe | null };

export type PlanDay = {
  id: string;
  day_date: string; // ISO date (yyyy-mm-dd)
  note: string | null;
  amber_mode: string | null;
  robin_mode: string | null;
  sort: number;
};

export type PlanDayWithMeals = PlanDay & { meals: PlanMealWithRecipe[] };

/** A day in the rendered range — may not have a persisted row yet (empty day). */
export type PlanningDay = {
  day_date: string;
  row: PlanDayWithMeals | null;
};
