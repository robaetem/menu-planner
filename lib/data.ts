import { getDb } from "@/lib/supabase/server";
import type {
  Household,
  Ingredient,
  Period,
  PeriodWithDays,
  RecipeWithIngredients,
  ShoppingCheck,
  ShoppingExtra,
} from "@/lib/types";

const DEFAULT_DINERS = [
  { key: "robin", label: "Robin" },
  { key: "amber", label: "Amber" },
];

export async function getHousehold(): Promise<Household> {
  const db = getDb();
  const { data } = await db.from("household").select("*").limit(1).single();
  if (!data) {
    return { id: "", name: "Robin & Amber", diners: DEFAULT_DINERS, default_people: 2, created_at: "" };
  }
  return {
    ...data,
    diners: Array.isArray(data.diners) && data.diners.length ? data.diners : DEFAULT_DINERS,
  } as Household;
}

function sortIngredients(r: RecipeWithIngredients): RecipeWithIngredients {
  return { ...r, ingredients: [...(r.ingredients || [])].sort((a, b) => a.sort - b.sort) };
}

export async function listRecipes(): Promise<RecipeWithIngredients[]> {
  const db = getDb();
  const { data, error } = await db
    .from("recipes")
    .select("*, ingredients(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => sortIngredients(r as RecipeWithIngredients));
}

export async function getRecipe(id: string): Promise<RecipeWithIngredients | null> {
  const db = getDb();
  const { data, error } = await db.from("recipes").select("*, ingredients(*)").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? sortIngredients(data as RecipeWithIngredients) : null;
}

export async function listPeriods(): Promise<Period[]> {
  const db = getDb();
  const { data, error } = await db.from("periods").select("*").order("start_date", { ascending: false });
  if (error) throw error;
  return (data || []) as Period[];
}

/** Periods with their day count + linked-meal count, for the list cards. */
export async function listPeriodsWithCounts(): Promise<(Period & { dayCount: number; mealCount: number })[]> {
  const db = getDb();
  const { data, error } = await db
    .from("periods")
    .select("*, plan_days(id, plan_meals(id))")
    .order("start_date", { ascending: false });
  if (error) throw error;
  return (data || []).map((p: any) => {
    const days = p.plan_days || [];
    const mealCount = days.reduce((n: number, d: any) => n + (d.plan_meals?.length || 0), 0);
    const { plan_days, ...rest } = p;
    return { ...(rest as Period), dayCount: days.length, mealCount };
  });
}

export async function getPeriodWithDays(id: string): Promise<PeriodWithDays | null> {
  const db = getDb();
  const { data, error } = await db
    .from("periods")
    .select("*, plan_days(*, plan_meals(*, recipe:recipes(*)))")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const days = ((data as any).plan_days || [])
    .map((d: any) => ({
      ...d,
      meals: [...(d.plan_meals || [])].sort((a: any, b: any) => a.sort - b.sort),
    }))
    .sort(
      (a: any, b: any) =>
        a.day_date.localeCompare(b.day_date) || a.sort - b.sort,
    );
  const { plan_days, ...rest } = data as any;
  return { ...(rest as Period), days } as PeriodWithDays;
}

export async function listExtras(periodId: string): Promise<ShoppingExtra[]> {
  const db = getDb();
  const { data } = await db
    .from("shopping_extras")
    .select("*")
    .eq("period_id", periodId)
    .order("sort", { ascending: true });
  return (data || []) as ShoppingExtra[];
}

export async function listChecks(periodId: string): Promise<ShoppingCheck[]> {
  const db = getDb();
  const { data } = await db.from("shopping_checks").select("*").eq("period_id", periodId);
  return (data || []) as ShoppingCheck[];
}

/** Everything needed to compute + render the shopping list for a period. */
export async function getShoppingData(periodId: string): Promise<{
  period: PeriodWithDays | null;
  ingredientsByRecipe: Record<string, Ingredient[]>;
  extras: ShoppingExtra[];
  checks: ShoppingCheck[];
}> {
  const period = await getPeriodWithDays(periodId);
  const db = getDb();

  const recipeIds = new Set<string>();
  period?.days.forEach((d) => d.meals.forEach((m) => m.recipe_id && recipeIds.add(m.recipe_id)));

  const ingredientsByRecipe: Record<string, Ingredient[]> = {};
  if (recipeIds.size) {
    const { data: ings } = await db.from("ingredients").select("*").in("recipe_id", [...recipeIds]);
    (ings || []).forEach((ig: any) => {
      (ingredientsByRecipe[ig.recipe_id] ||= []).push(ig as Ingredient);
    });
  }

  const { data: extras } = await db
    .from("shopping_extras")
    .select("*")
    .eq("period_id", periodId)
    .order("sort", { ascending: true });
  const { data: checks } = await db.from("shopping_checks").select("*").eq("period_id", periodId);

  return {
    period,
    ingredientsByRecipe,
    extras: (extras || []) as ShoppingExtra[],
    checks: (checks || []) as ShoppingCheck[],
  };
}
