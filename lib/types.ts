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
  include_in_shopping: boolean;
  sort: number;
};

export type Recipe = {
  id: string;
  title: string;
  tags: string[];
  prep_minutes: number | null;
  uses_fresh_veg: boolean;
  freezer_friendly: boolean;
  /** A recipe with a `[vleesje]` slot — the meat is chosen at planning time. */
  has_vleesje: boolean;
  base_servings: number;
  method: string | null;
  notes: string | null;
  image_path: string | null;
  cook_count: number;
  last_cooked_on: string | null;
  created_at: string;
  updated_at: string;
};

export type RecipeWithIngredients = Recipe & { ingredients: Ingredient[] };

/** A persisted ingredient minus its DB identifiers (used when (re)writing rows). */
export type IngredientRow = Omit<Ingredient, "id" | "recipe_id">;

/** Who a meal is for: Samen (both, full-width) or a single person (half-width). */
export type Assignee = "both" | "amber" | "robin";

/** A user-managed recipe tag. `value` is the stable key stored in recipes.tags[]. */
export type RecipeTag = {
  id: string;
  value: string;
  label: string;
  sort: number;
  created_at: string;
};

/** A user-managed day "mode" / situation for one person (amber or robin).
 *  `value` is the stable key stored in plan_days.amber_mode / robin_mode. */
export type PlanMode = {
  id: string;
  who: "amber" | "robin";
  value: string;
  label: string;
  sort: number;
  created_at: string;
};

export type Potje = {
  id: string;
  name: string;
  robin_count: number;
  amber_count: number;
  sort: number;
  created_at: string;
};

/** Raw meat in the freezer — single shared count (not portioned per person). */
export type Vleesje = {
  id: string;
  name: string;
  count: number;
  sort: number;
  created_at: string;
};

/** Fully manual frozen-vegetable inventory; no recipe or planning coupling. */
export type Groente = {
  id: string;
  name: string;
  count: number;
  sort: number;
  created_at: string;
};

/** A user-managed shopping section (Groenten & Fruit, Vlees & Vis, …). */
export type IngredientCategory = {
  id: string;
  name: string;
  sort: number;
  created_at: string;
};

/** Cached category for one ingredient name. `source` = who decided it. */
export type IngredientCategoryEntry = {
  id: string;
  name: string;
  category_id: string | null;
  source: "ai" | "user";
};

/** One vleesje chosen for a planned template meal. */
export type TemplateVleesje = {
  name: string;
  count: number;
  source: "freezer" | "buy";
};

export type PlanMeal = {
  id: string;
  plan_day_id: string;
  recipe_id: string | null;
  potje_id: string | null;
  assignee: Assignee;
  raw_text: string;
  freeform_title: string | null;
  cook: string | null;
  diner_count: number;
  diner_keys: string[];
  /** Extra potjes to cook & freeze, portioned per person (a Robin potje and an
   *  Amber potje differ in size for per_person ingredients). */
  freezer_robin: number;
  freezer_amber: number;
  from_freezer: boolean; // true = "Potje diepvries" (blue, eat from stock)
  template_vleesjes: TemplateVleesje[];
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
