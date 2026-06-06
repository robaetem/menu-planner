// Shared domain types for the Menu Planner (mirror the Supabase schema).

export type Diner = { key: string; label: string };

export type Household = {
  id: string;
  name: string;
  diners: Diner[];
  default_people: number;
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

export type Period = {
  id: string;
  title: string | null;
  start_date: string; // ISO date (yyyy-mm-dd)
  is_archived: boolean;
  created_at: string;
};

export type PlanMeal = {
  id: string;
  plan_day_id: string;
  recipe_id: string | null;
  raw_text: string;
  freeform_title: string | null;
  cook: string | null;
  diner_count: number;
  diner_keys: string[];
  freezer_servings: number;
  from_freezer: boolean;
  note: string | null;
  sort: number;
};

export type PlanMealWithRecipe = PlanMeal & { recipe: Recipe | null };

export type PlanDay = {
  id: string;
  period_id: string;
  day_date: string; // ISO date
  note: string | null;
  sort: number;
};

export type PlanDayWithMeals = PlanDay & { meals: PlanMealWithRecipe[] };

export type PeriodWithDays = Period & { days: PlanDayWithMeals[] };

export type ShoppingExtra = {
  id: string;
  period_id: string;
  text: string;
  checked: boolean;
  sort: number;
};

export type ShoppingCheck = {
  period_id: string;
  line_key: string;
  checked: boolean;
};
