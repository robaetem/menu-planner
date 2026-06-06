"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/supabase/server";
import { parseMealLine } from "@/lib/planning/meal-parser";
import { addIsoDays, todayIso } from "@/lib/date";
import type { ShoppingExtra } from "@/lib/types";

function touch(periodId: string) {
  revalidatePath(`/planning/${periodId}`);
  revalidatePath("/planning");
}

// ---------------------------------------------------------------- periods ----
export async function createPeriod(input: {
  start_date: string;
  title?: string | null;
  days: number;
}): Promise<string> {
  const db = getDb();
  const { data: period, error } = await db
    .from("periods")
    .insert({ start_date: input.start_date, title: input.title?.trim() || null })
    .select("id")
    .single();
  if (error) throw error;
  const n = Math.max(1, Math.min(31, input.days || 1));
  const rows = Array.from({ length: n }, (_, i) => ({
    period_id: period.id,
    day_date: addIsoDays(input.start_date, i),
    sort: i,
  }));
  const { error: e2 } = await db.from("plan_days").insert(rows);
  if (e2) throw e2;
  revalidatePath("/planning");
  return period.id as string;
}

export async function updatePeriod(
  id: string,
  patch: { title?: string | null; is_archived?: boolean },
): Promise<void> {
  const db = getDb();
  const { error } = await db.from("periods").update(patch).eq("id", id);
  if (error) throw error;
  touch(id);
}

export async function deletePeriod(id: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from("periods").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/planning");
}

/** Mark a period done: archive it and bump cook_count / last_cooked_on for every
 *  linked recipe (read-modify-write; fine at household scale). */
export async function archivePeriod(id: string): Promise<void> {
  const db = getDb();
  const { data: period } = await db
    .from("periods")
    .select("start_date, plan_days(plan_meals(recipe_id, from_freezer))")
    .eq("id", id)
    .maybeSingle();

  const recipeIds = new Set<string>();
  (period as any)?.plan_days?.forEach((d: any) =>
    d.plan_meals?.forEach((m: any) => {
      if (m.recipe_id && !m.from_freezer) recipeIds.add(m.recipe_id);
    }),
  );
  if (recipeIds.size) {
    const { data: recs } = await db.from("recipes").select("id, cook_count").in("id", [...recipeIds]);
    const cookedOn = (period as any)?.start_date ?? todayIso();
    for (const r of recs || []) {
      await db
        .from("recipes")
        .update({ cook_count: (r.cook_count || 0) + 1, last_cooked_on: cookedOn })
        .eq("id", r.id);
    }
  }
  await db.from("periods").update({ is_archived: true }).eq("id", id);
  touch(id);
}

export async function duplicatePeriod(id: string): Promise<string> {
  const db = getDb();
  const { data: src } = await db
    .from("periods")
    .select("title, start_date, plan_days(*, plan_meals(*))")
    .eq("id", id)
    .maybeSingle();
  if (!src) throw new Error("Period not found");

  const { data: period, error } = await db
    .from("periods")
    .insert({ start_date: (src as any).start_date, title: (src as any).title })
    .select("id")
    .single();
  if (error) throw error;

  const srcDays = [...((src as any).plan_days || [])].sort((a: any, b: any) =>
    a.day_date.localeCompare(b.day_date),
  );
  for (const d of srcDays) {
    const { data: nd } = await db
      .from("plan_days")
      .insert({ period_id: period.id, day_date: d.day_date, note: d.note, sort: d.sort })
      .select("id")
      .single();
    const meals = (d.plan_meals || []).map((m: any) => ({
      plan_day_id: nd!.id,
      recipe_id: m.recipe_id,
      raw_text: m.raw_text,
      freeform_title: m.freeform_title,
      cook: m.cook,
      diner_count: m.diner_count,
      diner_keys: m.diner_keys,
      freezer_servings: m.freezer_servings,
      from_freezer: m.from_freezer,
      note: m.note,
      sort: m.sort,
    }));
    if (meals.length) await db.from("plan_meals").insert(meals);
  }
  revalidatePath("/planning");
  return period.id as string;
}

// ------------------------------------------------------------------- days ----
export async function addDay(periodId: string): Promise<void> {
  const db = getDb();
  const { data: days } = await db
    .from("plan_days")
    .select("day_date")
    .eq("period_id", periodId)
    .order("day_date", { ascending: false })
    .limit(1);
  const nextDate = days && days.length ? addIsoDays(days[0].day_date, 1) : todayIso();
  const { count } = await db
    .from("plan_days")
    .select("id", { count: "exact", head: true })
    .eq("period_id", periodId);
  const { error } = await db
    .from("plan_days")
    .insert({ period_id: periodId, day_date: nextDate, sort: count || 0 });
  if (error) throw error;
  touch(periodId);
}

export async function updateDay(
  periodId: string,
  dayId: string,
  patch: { day_date?: string; note?: string | null },
): Promise<void> {
  const db = getDb();
  const { error } = await db.from("plan_days").update(patch).eq("id", dayId);
  if (error) throw error;
  touch(periodId);
}

export async function removeDay(periodId: string, dayId: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from("plan_days").delete().eq("id", dayId);
  if (error) throw error;
  touch(periodId);
}

// ------------------------------------------------------------------ meals ----
export async function addMeal(periodId: string, planDayId: string, rawText: string): Promise<void> {
  const db = getDb();
  const parsed = parseMealLine(rawText);
  const { count } = await db
    .from("plan_meals")
    .select("id", { count: "exact", head: true })
    .eq("plan_day_id", planDayId);
  const { error } = await db.from("plan_meals").insert({
    plan_day_id: planDayId,
    raw_text: rawText,
    freeform_title: parsed.title,
    cook: parsed.cook,
    freezer_servings: parsed.freezer_servings,
    sort: count || 0,
  });
  if (error) throw error;
  touch(periodId);
}

export type MealPatch = {
  raw_text?: string;
  recipe_id?: string | null;
  freeform_title?: string | null;
  diner_count?: number;
  diner_keys?: string[];
  freezer_servings?: number;
  from_freezer?: boolean;
  note?: string | null;
};

export async function updateMeal(periodId: string, mealId: string, patch: MealPatch): Promise<void> {
  const db = getDb();
  const update: Record<string, unknown> = { ...patch };
  // If the meal line itself changed, re-derive the parsed bits from it.
  if (patch.raw_text != null) {
    const parsed = parseMealLine(patch.raw_text);
    update.freeform_title = parsed.title;
    update.cook = parsed.cook;
    update.freezer_servings = parsed.freezer_servings;
  }
  const { error } = await db.from("plan_meals").update(update).eq("id", mealId);
  if (error) throw error;
  touch(periodId);
}

export async function deleteMeal(periodId: string, mealId: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from("plan_meals").delete().eq("id", mealId);
  if (error) throw error;
  touch(periodId);
}

// --------------------------------------------------------------- shopping ----
export async function setShoppingCheck(periodId: string, lineKey: string, checked: boolean): Promise<void> {
  const db = getDb();
  if (checked) {
    const { error } = await db
      .from("shopping_checks")
      .upsert({ period_id: periodId, line_key: lineKey, checked: true }, { onConflict: "period_id,line_key" });
    if (error) throw error;
  } else {
    const { error } = await db
      .from("shopping_checks")
      .delete()
      .eq("period_id", periodId)
      .eq("line_key", lineKey);
    if (error) throw error;
  }
}

export async function addExtra(periodId: string, text: string): Promise<ShoppingExtra | null> {
  const db = getDb();
  const t = text.trim();
  if (!t) return null;
  const { count } = await db
    .from("shopping_extras")
    .select("id", { count: "exact", head: true })
    .eq("period_id", periodId);
  const { data, error } = await db
    .from("shopping_extras")
    .insert({ period_id: periodId, text: t, sort: count || 0 })
    .select()
    .single();
  if (error) throw error;
  touch(periodId);
  return data as ShoppingExtra;
}

export async function toggleExtra(periodId: string, extraId: string, checked: boolean): Promise<void> {
  const db = getDb();
  const { error } = await db.from("shopping_extras").update({ checked }).eq("id", extraId);
  if (error) throw error;
}

export async function deleteExtra(periodId: string, extraId: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from("shopping_extras").delete().eq("id", extraId);
  if (error) throw error;
  touch(periodId);
}
