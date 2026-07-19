"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDb } from "@/lib/supabase/server";
import { addIsoDays, todayIso } from "@/lib/date";
import type { Assignee, TemplateVleesje } from "@/lib/types";

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

/** Free-text note for one day (e.g. "Gebruik worsten uit de diepvries"). */
export async function setDayNote(dayDate: string, note: string): Promise<void> {
  const db = getDb();
  const dayId = await ensureDay(db, dayDate);
  const trimmed = note.trim();
  const { error } = await db
    .from("plan_days")
    .update({ note: trimmed || null })
    .eq("id", dayId);
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
  revalidatePath("/diepvries");
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
    sort: await nextSort(db, dayId),
  });
  if (error) throw error;
  revalidatePath("/planning");
}

export async function deleteMeal(mealId: string): Promise<void> {
  const db = getDb();
  const { data: meal } = await db
    .from("plan_meals")
    .select("from_freezer, assignee, freeform_title, raw_text, template_vleesjes")
    .eq("id", mealId)
    .maybeSingle();
  const { error } = await db.from("plan_meals").delete().eq("id", mealId);
  if (error) throw error;

  // Return any freezer vleesjes this meal had reserved back to the inventory.
  if (meal?.template_vleesjes) {
    for (const { name, count } of freezerTotals(meal.template_vleesjes as TemplateVleesje[]).values()) {
      await restoreVleesje(db, name, count);
    }
  }

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
  revalidatePath("/vleesjes");
  revalidatePath("/diepvries");
}

// ----------------------------------------------------------- template vleesjes ---
function freezerTotals(vleesjes: TemplateVleesje[]): Map<string, { name: string; count: number }> {
  const m = new Map<string, { name: string; count: number }>();
  for (const v of vleesjes || []) {
    if (v.source !== "freezer") continue;
    const name = (v.name || "").trim();
    const key = name.toLowerCase();
    if (!key) continue;
    const prev = m.get(key);
    m.set(key, { name: prev?.name ?? name, count: (prev?.count ?? 0) + (Number(v.count) || 0) });
  }
  return m;
}

/** Put `count` of a vleesje back into the inventory by name (increment if it
 *  still exists, else recreate — names are the vleesje's identity). */
async function restoreVleesje(db: SupabaseClient, name: string, count: number): Promise<void> {
  if (count <= 0) return;
  const { data: existing } = await db.from("vleesjes").select("id, count").ilike("name", name).maybeSingle();
  if (existing) {
    await db.from("vleesjes").update({ count: existing.count + count }).eq("id", existing.id);
  } else {
    const { count: n } = await db.from("vleesjes").select("id", { count: "exact", head: true });
    await db.from("vleesjes").insert({ name, count, sort: n || 0 });
    const { data: known } = await db.from("vleesje_names").select("id").ilike("name", name).maybeSingle();
    if (!known) await db.from("vleesje_names").insert({ name });
  }
}

/** Take `count` of a vleesje out of the inventory by name (clamped at 0). */
async function consumeVleesje(db: SupabaseClient, name: string, count: number): Promise<void> {
  if (count <= 0) return;
  const { data: existing } = await db.from("vleesjes").select("id, count").ilike("name", name).maybeSingle();
  if (!existing) return;
  await db.from("vleesjes").update({ count: Math.max(0, existing.count - count) }).eq("id", existing.id);
}

/** Set the vleesjes chosen for a template meal. Freezer lines are reconciled
 *  against the inventory (restore the old selection, consume the new one); buy
 *  lines only land on the shopping list at generation time. */
export async function setMealVleesjes(mealId: string, vleesjes: TemplateVleesje[]): Promise<void> {
  const db = getDb();
  const clean: TemplateVleesje[] = (vleesjes || [])
    .map((v) => ({
      name: (v.name || "").trim(),
      count: Math.max(1, Math.floor(Number(v.count) || 1)),
      source: v.source === "buy" ? ("buy" as const) : ("freezer" as const),
    }))
    .filter((v) => v.name);

  const { data: meal } = await db.from("plan_meals").select("template_vleesjes").eq("id", mealId).maybeSingle();
  const oldFreezer = freezerTotals((meal?.template_vleesjes || []) as TemplateVleesje[]);
  const newFreezer = freezerTotals(clean);

  for (const { name, count } of oldFreezer.values()) await restoreVleesje(db, name, count);
  for (const { name, count } of newFreezer.values()) await consumeVleesje(db, name, count);

  const { error } = await db.from("plan_meals").update({ template_vleesjes: clean }).eq("id", mealId);
  if (error) throw error;
  revalidatePath("/planning");
  revalidatePath("/vleesjes");
  revalidatePath("/diepvries");
}

/** Set how many extra potjes to cook & freeze, per person (Robin / Amber). */
export async function setMealFreezer(mealId: string, robin: number, amber: number): Promise<void> {
  const db = getDb();
  const clamp = (n: number) => Math.max(0, Math.min(20, Math.floor(n) || 0));
  const { error } = await db
    .from("plan_meals")
    .update({ freezer_robin: clamp(robin), freezer_amber: clamp(amber) })
    .eq("id", mealId);
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
