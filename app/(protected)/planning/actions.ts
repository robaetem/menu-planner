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
function needs(assignee: Assignee): { robin: boolean; amber: boolean } {
  return { robin: assignee === "both" || assignee === "robin", amber: assignee === "both" || assignee === "amber" };
}

/** "Potje diepvries" — take a specific potje from the freezer inventory and
 *  decrement its count for the eating person(s) (blue card, buys nothing). */
export async function addPotjeFromInventory(
  dayDate: string,
  assignee: Assignee,
  potjeId: string,
): Promise<void> {
  const db = getDb();
  const { data: potje } = await db.from("potjes").select("*").eq("id", potjeId).maybeSingle();
  if (!potje) throw new Error("Potje niet gevonden");
  const n = needs(assignee);
  if ((n.robin && potje.robin_count < 1) || (n.amber && potje.amber_count < 1)) {
    throw new Error("Geen potje beschikbaar");
  }
  const dayId = await ensureDay(db, dayDate);
  const d = dinersFor(assignee);
  const { error } = await db.from("plan_meals").insert({
    plan_day_id: dayId,
    assignee,
    from_freezer: true,
    recipe_id: null,
    potje_id: potjeId,
    freeform_title: potje.name,
    raw_text: potje.name,
    diner_keys: d.diner_keys,
    diner_count: d.diner_count,
    freezer_servings: 0,
    sort: await nextSort(db, dayId),
  });
  if (error) throw error;
  const newRobin = potje.robin_count - (n.robin ? 1 : 0);
  const newAmber = potje.amber_count - (n.amber ? 1 : 0);
  if (newRobin <= 0 && newAmber <= 0) {
    // No instances left — drop it from the potjes list. The plan_meal keeps the
    // name (freeform_title) + assignee so deassigning can restore it by name.
    await db.from("potjes").delete().eq("id", potjeId);
  } else {
    await db.from("potjes").update({ robin_count: newRobin, amber_count: newAmber }).eq("id", potjeId);
  }
  revalidatePath("/planning");
  revalidatePath("/potjes");
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
  const { data: meal } = await db
    .from("plan_meals")
    .select("from_freezer, assignee, freeform_title, raw_text")
    .eq("id", mealId)
    .maybeSingle();
  const { error } = await db.from("plan_meals").delete().eq("id", mealId);
  if (error) throw error;

  // Deassigning a "Potje diepvries" returns it to the inventory — restored by
  // name so it works whether the potje still exists (partly consumed) or was
  // removed when it hit zero (recreated). Names are the potje's identity.
  if (meal?.from_freezer) {
    const name = (meal.freeform_title || meal.raw_text || "").trim();
    if (name) {
      const n = needs(meal.assignee as Assignee);
      const { data: existing } = await db.from("potjes").select("*").ilike("name", name).maybeSingle();
      if (existing) {
        await db
          .from("potjes")
          .update({
            robin_count: existing.robin_count + (n.robin ? 1 : 0),
            amber_count: existing.amber_count + (n.amber ? 1 : 0),
          })
          .eq("id", existing.id);
      } else {
        const { count } = await db.from("potjes").select("id", { count: "exact", head: true });
        await db.from("potjes").insert({
          name,
          robin_count: n.robin ? 1 : 0,
          amber_count: n.amber ? 1 : 0,
          sort: count || 0,
        });
      }
    }
  }
  revalidatePath("/planning");
  revalidatePath("/potjes");
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
