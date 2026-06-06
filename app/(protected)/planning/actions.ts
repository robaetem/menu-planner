"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDb } from "@/lib/supabase/server";
import { addIsoDays, todayIso } from "@/lib/date";
import type { Assignee } from "@/lib/types";

function dinersFor(assignee: Assignee): { diner_keys: string[]; diner_count: number } {
  if (assignee === "amber") return { diner_keys: ["amber"], diner_count: 1 };
  if (assignee === "robin") return { diner_keys: ["robin"], diner_count: 1 };
  return { diner_keys: ["robin", "amber"], diner_count: 2 };
}

/** Get the plan_day row id for a date, creating it if needed. */
async function ensureDay(db: SupabaseClient, dayDate: string): Promise<string> {
  const { data: existing } = await db.from("plan_days").select("id").eq("day_date", dayDate).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await db.from("plan_days").insert({ day_date: dayDate }).select("id").single();
  if (!error && data) return data.id as string;
  // unique-violation race: someone created it concurrently
  const { data: again } = await db.from("plan_days").select("id").eq("day_date", dayDate).maybeSingle();
  if (again) return again.id as string;
  throw error ?? new Error("Kon dag niet aanmaken");
}

async function nextSort(db: SupabaseClient, planDayId: string): Promise<number> {
  const { count } = await db
    .from("plan_meals")
    .select("id", { count: "exact", head: true })
    .eq("plan_day_id", planDayId);
  return count || 0;
}

// --------------------------------------------------------------- day modes ---
export async function setMode(
  dayDate: string,
  who: "amber" | "robin",
  mode: string | null,
): Promise<void> {
  const db = getDb();
  const dayId = await ensureDay(db, dayDate);
  const patch = who === "amber" ? { amber_mode: mode } : { robin_mode: mode };
  const { error } = await db.from("plan_days").update(patch).eq("id", dayId);
  if (error) throw error;
  revalidatePath("/planning");
}

// ------------------------------------------------------------------ meals ----
/** "Potje diepvries" — eat from the freezer (blue card, no recipe, buys nothing). */
export async function addPotje(dayDate: string, assignee: Assignee): Promise<void> {
  const db = getDb();
  const dayId = await ensureDay(db, dayDate);
  const d = dinersFor(assignee);
  const { error } = await db.from("plan_meals").insert({
    plan_day_id: dayId,
    assignee,
    from_freezer: true,
    recipe_id: null,
    freeform_title: "Potje diepvries",
    raw_text: "Potje diepvries",
    diner_keys: d.diner_keys,
    diner_count: d.diner_count,
    freezer_servings: 0,
    sort: await nextSort(db, dayId),
  });
  if (error) throw error;
  revalidatePath("/planning");
}

/** "Gerecht" — assign a recipe to the day (yellow card). */
export async function assignRecipe(dayDate: string, assignee: Assignee, recipeId: string): Promise<void> {
  const db = getDb();
  const { data: recipe } = await db.from("recipes").select("title").eq("id", recipeId).maybeSingle();
  const dayId = await ensureDay(db, dayDate);
  const d = dinersFor(assignee);
  const { error } = await db.from("plan_meals").insert({
    plan_day_id: dayId,
    assignee,
    from_freezer: false,
    recipe_id: recipeId,
    freeform_title: recipe?.title ?? "Gerecht",
    raw_text: recipe?.title ?? "",
    diner_keys: d.diner_keys,
    diner_count: d.diner_count,
    freezer_servings: 0,
    sort: await nextSort(db, dayId),
  });
  if (error) throw error;
  revalidatePath("/planning");
}

export async function deleteMeal(mealId: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from("plan_meals").delete().eq("id", mealId);
  if (error) throw error;
  revalidatePath("/planning");
}

export async function setMealPotjes(mealId: string, n: number): Promise<void> {
  const db = getDb();
  const value = Math.max(0, Math.min(20, Math.floor(n) || 0));
  const { error } = await db.from("plan_meals").update({ freezer_servings: value }).eq("id", mealId);
  if (error) throw error;
  revalidatePath("/planning");
}

// -------------------------------------------------------------- horizon ----
/** Extend the plan by `days` beyond the current end. */
export async function extendDays(days = 7): Promise<void> {
  const db = getDb();
  const today = todayIso();
  const { data: hh } = await db.from("household").select("id, plan_horizon").limit(1).single();
  const { data: rows } = await db
    .from("plan_days")
    .select("day_date")
    .gte("day_date", today)
    .order("day_date", { ascending: false })
    .limit(1);
  const minEnd = addIsoDays(today, 10);
  const latestRow = rows && rows.length ? rows[0].day_date : today;
  const candidates = [minEnd, latestRow];
  if (hh?.plan_horizon) candidates.push(hh.plan_horizon);
  const end = candidates.sort()[candidates.length - 1];
  const { error } = await db
    .from("household")
    .update({ plan_horizon: addIsoDays(end, Math.max(1, days)) })
    .eq("id", hh!.id);
  if (error) throw error;
  revalidatePath("/planning");
}
