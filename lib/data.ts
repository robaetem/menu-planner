import { getDb } from "@/lib/supabase/server";
import { addIsoDays, todayIso } from "@/lib/date";
import type {
  Household,
  Groente,
  IngredientCategory,
  IngredientCategoryEntry,
  PlanDayWithMeals,
  PlanMode,
  PlanningDay,
  Potje,
  RecipeTag,
  RecipeWithIngredients,
  Vleesje,
} from "@/lib/types";

const DEFAULT_DINERS = [
  { key: "robin", label: "Robin" },
  { key: "amber", label: "Amber" },
];

const HORIZON_MIN_DAYS = 10; // always show at least today..today+10
const HORIZON_MAX_DAYS = 180; // safety cap

export async function getHousehold(): Promise<Household> {
  const db = getDb();
  const { data } = await db.from("household").select("*").limit(1).single();
  if (!data) {
    return { id: "", name: "Robin & Amber", diners: DEFAULT_DINERS, default_people: 2, plan_horizon: null, created_at: "" };
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

export async function listPotjes(): Promise<Potje[]> {
  const db = getDb();
  const { data, error } = await db
    .from("potjes")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as Potje[];
}

export async function listVleesjes(): Promise<Vleesje[]> {
  const db = getDb();
  const { data, error } = await db
    .from("vleesjes")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as Vleesje[];
}

export async function listGroenten(): Promise<Groente[]> {
  const db = getDb();
  const { data, error } = await db
    .from("groenten")
    .select("*")
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as Groente[];
}

export async function listGroenteNames(): Promise<string[]> {
  const db = getDb();
  const { data, error } = await db.from("groente_names").select("name").order("name", { ascending: true });
  if (error) throw error;
  return (data || []).map((row: { name: string }) => row.name);
}

/** Every vleesje name ever entered — powers the add/pick autocomplete. */
export async function listVleesjeNames(): Promise<string[]> {
  const db = getDb();
  const { data, error } = await db.from("vleesje_names").select("name").order("name", { ascending: true });
  if (error) throw error;
  return (data || []).map((r: { name: string }) => r.name);
}

/** The household's permanent manual document and replaceable planner document. */
export async function getShoppingDocs(): Promise<{ manual: unknown | null; generated: unknown | null }> {
  const db = getDb();
  const { data, error } = await db
    .from("shopping_doc")
    .select("content, generated_content")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return {
    manual: data?.content ?? null,
    generated: data?.generated_content ?? null,
  };
}

/** User-managed shopping sections, ordered. */
export async function listCategories(): Promise<IngredientCategory[]> {
  const db = getDb();
  const { data, error } = await db
    .from("ingredient_categories")
    .select("*")
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as IngredientCategory[];
}

/** The cached ingredient-name -> category map. */
export async function listCategoryMap(): Promise<IngredientCategoryEntry[]> {
  const db = getDb();
  const { data, error } = await db
    .from("ingredient_category_map")
    .select("id, name, category_id, source")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []) as IngredientCategoryEntry[];
}

export async function listTags(): Promise<RecipeTag[]> {
  const db = getDb();
  const { data, error } = await db
    .from("recipe_tags")
    .select("*")
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as RecipeTag[];
}

/** User-managed day modes (the Amber/Robin situation pills), ordered per person. */
export async function listModes(): Promise<PlanMode[]> {
  const db = getDb();
  const { data, error } = await db
    .from("plan_modes")
    .select("*")
    .order("who", { ascending: true })
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as PlanMode[];
}

/** Every potje name ever entered — powers the add-potje autocomplete. */
export async function listPotjeNames(): Promise<string[]> {
  const db = getDb();
  const { data, error } = await db.from("potje_names").select("name").order("name", { ascending: true });
  if (error) throw error;
  return (data || []).map((r: { name: string }) => r.name);
}

export async function getRecipe(id: string): Promise<RecipeWithIngredients | null> {
  const db = getDb();
  const { data, error } = await db.from("recipes").select("*, ingredients(*)").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? sortIngredients(data as RecipeWithIngredients) : null;
}

/**
 * The single rolling plan: every date from today to the end of the horizon
 * (at least today+10, longer if the household extended it or has later rows).
 * Empty dates get a `row: null` placeholder so they still render.
 */
export async function getPlanningDays(): Promise<{ days: PlanningDay[]; end: string }> {
  const db = getDb();
  const today = todayIso();

  const { data, error } = await db
    .from("plan_days")
    .select("*, plan_meals(*, recipe:recipes(*))")
    .gte("day_date", today)
    .order("day_date", { ascending: true });
  if (error) throw error;

  const rows: PlanDayWithMeals[] = (data || []).map((d: any) => {
    const { plan_meals, ...rest } = d;
    return { ...rest, meals: [...(plan_meals || [])].sort((a: any, b: any) => a.sort - b.sort) };
  });

  const hh = await getHousehold();
  const minEnd = addIsoDays(today, HORIZON_MIN_DAYS);
  const latestRow = rows.length ? rows[rows.length - 1].day_date : today;
  const candidates = [minEnd, latestRow];
  if (hh.plan_horizon) candidates.push(hh.plan_horizon);
  const cap = addIsoDays(today, HORIZON_MAX_DAYS);
  let end = candidates.sort()[candidates.length - 1];
  if (end > cap) end = cap;

  const byDate = new Map(rows.map((r) => [r.day_date, r]));
  const days: PlanningDay[] = [];
  for (let d = today; d <= end; d = addIsoDays(d, 1)) {
    days.push({ day_date: d, row: byDate.get(d) ?? null });
  }
  return { days, end };
}
