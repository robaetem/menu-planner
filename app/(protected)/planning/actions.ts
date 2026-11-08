"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDb } from "@/lib/supabase/server";
import { addIsoDays, formatDayLabel, todayIso } from "@/lib/date";
import { dinersFor, needs } from "@/lib/planning/assignment";
import { listPortions } from "@/lib/data";
import {
  availablePortions,
  nameKey,
  pickPortions,
  readyOn,
  type Portion,
  type Who,
} from "@/lib/freezer/potjes";
import { assertCookBefore, syncCookedPortions } from "@/lib/freezer/server";
import { formatGroenteQuantity, normalizeGroenteUnit } from "@/lib/freezer/inventory";
import { syncMealBuyLines, type BuyLineMeal } from "@/lib/shopping/sync-buy-lines";
import { demandLines, loadStock, rebalanceStock, settleFreezer, syncMealStock } from "@/lib/freezer/stock-server";
import { pickFromStock, round3, stockKey } from "@/lib/freezer/stock";
import type { Assignee, TemplateGroente, TemplateVleesje } from "@/lib/types";

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

function revalidateFreezer() {
  revalidatePath("/planning");
  revalidatePath("/potjes");
  revalidatePath("/diepvries");
}

/** "Potje diepvries" — plan eating a frozen dish on `dayDate`. Reserves the
 *  oldest portion that is cooked before that day, one per person eating. The
 *  freezer itself only empties when the day comes. */
export async function planPotje(dayDate: string, assignee: Assignee, name: string): Promise<void> {
  const db = getDb();
  const picked = pickPortions(await listPortions(), name, dayDate, assignee, todayIso());
  if (!picked) throw new Error(`Geen potje “${name}” beschikbaar op ${formatDayLabel(dayDate)}.`);

  const dayId = await ensureDay(db, dayDate);
  const d = dinersFor(assignee);
  const { data: meal, error } = await db
    .from("plan_meals")
    .insert({
      plan_day_id: dayId,
      assignee,
      from_freezer: true,
      recipe_id: null,
      freeform_title: picked[0].name,
      raw_text: picked[0].name,
      diner_keys: d.diner_keys,
      diner_count: d.diner_count,
      sort: await nextSort(db, dayId),
    })
    .select("id")
    .single();
  if (error) throw error;

  const { data: reserved, error: reserveError } = await db
    .from("freezer_portions")
    .update({ eaten_by_meal_id: meal.id })
    .in("id", picked.map((p) => p.id))
    .is("eaten_by_meal_id", null)
    .select("id");
  if (reserveError || (reserved || []).length !== picked.length) {
    // Someone else took it in the meantime — undo rather than half-plan it.
    await db.from("freezer_portions").update({ eaten_by_meal_id: null }).eq("eaten_by_meal_id", meal.id);
    await db.from("plan_meals").delete().eq("id", meal.id);
    throw reserveError ?? new Error("Dat potje is net ingepland. Probeer opnieuw.");
  }
  revalidateFreezer();
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

/** "Groente diepvries" — plan a meal straight from a freezer vegetable, the
 *  way "Potje diepvries" plans from the potjes tab. Takes one picker-step
 *  (oldest entry first) that leaves the freezer on the meal's day; the meal
 *  stays an ordinary meal, so the groente stays adjustable afterwards. */
export async function planGroente(
  dayDate: string,
  assignee: Assignee,
  name: string,
  unit: string,
  amount: number,
): Promise<void> {
  const groenteName = (name || "").trim();
  const groenteUnit = (unit || "").trim();
  const want = Math.max(0, Math.round((Number(amount) || 0) * 1000) / 1000);
  if (!groenteName || want <= 0) throw new Error("Kies een groente uit de diepvries.");

  // Refuse before anything is written when the freezer can't cover it.
  const db = getDb();
  await settleFreezer(db);
  const stock = await loadStock(db, "groente");
  const { picks, short } = pickFromStock(
    stock.entries,
    stock.reservations,
    stockKey(groenteName, groenteUnit),
    want,
  );
  const got = round3(picks.reduce((s, p) => s + p.amount, 0));
  if (short > 0) {
    throw new Error(
      got > 0
        ? `Er is nog maar ${formatGroenteQuantity(got, normalizeGroenteUnit(groenteUnit))} ${groenteName} vrij in de diepvries.`
        : `Er is geen ${groenteName} meer vrij in de diepvries.`,
    );
  }

  const dayId = await ensureDay(db, dayDate);
  const d = dinersFor(assignee);
  const groente: TemplateGroente = { name: groenteName, unit: groenteUnit, amount: want, replaces: null };
  const { data: meal, error } = await db
    .from("plan_meals")
    .insert({
      plan_day_id: dayId,
      assignee,
      from_freezer: false,
      recipe_id: null,
      freeform_title: groenteName,
      raw_text: groenteName,
      template_groenten: [groente],
      diner_keys: d.diner_keys,
      diner_count: d.diner_count,
      sort: await nextSort(db, dayId),
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: reserveError } = await db
    .from("freezer_reservations")
    .insert(picks.map((p) => ({ meal_id: meal.id, groente_id: p.entryId, amount: p.amount })));
  if (reserveError) throw reserveError;

  revalidateStock();
}

export async function deleteMeal(mealId: string): Promise<void> {
  const db = getDb();
  const { data: meal } = await db
    .from("plan_meals")
    .select(MEAL_FOR_BUY_LINES)
    .eq("id", mealId)
    .maybeSingle();

  // Cooking this meal fills potjes that another day already plans to eat.
  const planned = (await listPortions())
    .filter((p) => p.sourceMealId === mealId && p.eatenOn)
    .sort((a, b) => (a.eatenOn! < b.eatenOn! ? -1 : 1));
  if (planned.length) {
    throw new Error(
      `Een potje van dit gerecht staat al ingepland op ${formatDayLabel(planned[0].eatenOn!)}. Haal dat eerst weg.`,
    );
  }

  // Its own portions go with it (cascade); portions it was going to eat are
  // released (set null) and can be planned again.
  const { error } = await db.from("plan_meals").delete().eq("id", mealId);
  if (error) throw error;

  // Its freezer reservations went with it (cascade): the stock is free again
  // and goes to the next meal that is short of it.
  if (meal) {
    await rebalanceStock(db, "vleesje");
    await rebalanceStock(db, "groente");
    await syncMealBuyLines(db, buyLineMeal(meal), (meal.template_vleesjes || []) as TemplateVleesje[], []);
  }

  revalidateFreezer();
  revalidatePath("/vleesjes");
  revalidatePath("/boodschappenlijstje");
}

/** Drag & drop: move a planned meal to another day and/or another person.
 *
 *  Dropping into a different box changes who eats it, which re-scales the
 *  ingredients (`diner_keys`/`diner_count`). The freezer has to stay possible:
 *  - a "Potje diepvries" keeps one reserved portion per person eating, each
 *    cooked before the new day (moving Samen -> Amber releases Robin's, moving
 *    Amber -> Samen reserves a Robin one, which is refused when there is none);
 *  - a cooking meal can't move to or past a day that eats one of its potjes. */
export async function moveMeal(
  mealId: string,
  toDayDate: string,
  toAssignee: Assignee,
): Promise<void> {
  const db = getDb();
  const { data: meal } = await db
    .from("plan_meals")
    .select("id, plan_day_id, assignee, from_freezer, freeform_title, raw_text")
    .eq("id", mealId)
    .maybeSingle();
  if (!meal) throw new Error("Maaltijd niet gevonden");

  const toDayId = await ensureDay(db, toDayDate);
  const from = meal.assignee as Assignee;
  if (meal.plan_day_id === toDayId && from === toAssignee) return; // dropped where it started

  const portions = await listPortions();
  const reservations = meal.from_freezer
    ? planReservations(portions, meal.id, meal.freeform_title || meal.raw_text || "", toDayDate, toAssignee)
    : null;
  if (!meal.from_freezer) assertCookBefore(portions, meal.id, toDayDate);

  const d = dinersFor(toAssignee);
  const { error } = await db
    .from("plan_meals")
    .update({
      plan_day_id: toDayId,
      assignee: toAssignee,
      diner_keys: d.diner_keys,
      diner_count: d.diner_count,
      sort: await nextSort(db, toDayId),
    })
    .eq("id", mealId);
  if (error) throw error;

  if (reservations) {
    if (reservations.release.length) {
      await db.from("freezer_portions").update({ eaten_by_meal_id: null }).in("id", reservations.release);
    }
    if (reservations.reserve.length) {
      await db.from("freezer_portions").update({ eaten_by_meal_id: mealId }).in("id", reservations.reserve);
    }
  }
  revalidateFreezer();
}

/** Which portions a "Potje diepvries" should hold after moving to `date` /
 *  `assignee`: keep what still fits, swap one that isn't cooked yet by then for
 *  one that is, reserve for a person newly eating. Throws when impossible. */
function planReservations(
  portions: Portion[],
  mealId: string,
  name: string,
  date: string,
  assignee: Assignee,
): { release: string[]; reserve: string[] } {
  const today = todayIso();
  const n = needs(assignee);
  const release: string[] = [];
  const reserve: string[] = [];
  const mine = portions.filter((p) => p.eatenByMealId === mealId);
  for (const who of ["robin", "amber"] as Who[]) {
    const held = mine.filter((p) => p.who === who);
    if (!n[who]) {
      release.push(...held.map((p) => p.id));
      continue;
    }
    const keep = held.find((p) => !readyOn(p) || readyOn(p)! <= date);
    release.push(...held.filter((p) => p !== keep).map((p) => p.id));
    if (keep) continue;
    const swap = availablePortions(portions, date, who, today).find((p) => nameKey(p.name) === nameKey(name));
    if (!swap) {
      const later = held.find((p) => readyOn(p));
      throw new Error(
        later
          ? `“${name}” wordt pas gemaakt op ${formatDayLabel(later.cookOn!)}, dus eten kan ten vroegste op ${formatDayLabel(readyOn(later)!)}.`
          : `Geen potje “${name}” meer voor ${who === "robin" ? "Robin" : "Amber"}.`,
      );
    }
    reserve.push(swap.id);
  }
  return { release, reserve };
}

// ------------------------------------------- freezer vleesjes & groenten ---
/** What a meal's buy lines on the boodschappenlijstje are labelled with. */
const MEAL_FOR_BUY_LINES =
  "template_vleesjes, template_groenten, assignee, freeform_title, raw_text, recipe:recipes(title), day:plan_days(day_date)";

function buyLineMeal(meal: any): BuyLineMeal {
  return {
    label: meal.recipe?.title || meal.freeform_title || meal.raw_text || "Maaltijd",
    date: meal.day?.day_date || "",
    assignee: meal.assignee ?? null,
  };
}

function revalidateStock() {
  revalidatePath("/planning");
  revalidatePath("/boodschappenlijstje");
  revalidatePath("/vleesjes");
  revalidatePath("/diepvries");
}

/** Set the vleesjes chosen for a template meal. Freezer lines reserve stock
 *  (oldest entry first) that leaves the freezer on the meal's day; asking for
 *  more than is free is refused. Buy lines go onto the boodschappenlijstje. */
export async function setMealVleesjes(mealId: string, vleesjes: TemplateVleesje[]): Promise<void> {
  const db = getDb();
  const clean: TemplateVleesje[] = (vleesjes || [])
    .map((v) => ({
      name: (v.name || "").trim(),
      count: Math.max(1, Math.floor(Number(v.count) || 1)),
      source: v.source === "buy" ? ("buy" as const) : ("freezer" as const),
    }))
    .filter((v) => v.name);

  const { data: meal } = await db.from("plan_meals").select(MEAL_FOR_BUY_LINES).eq("id", mealId).maybeSingle();
  if (!meal) throw new Error("Maaltijd niet gevonden");
  const day = (meal as any).day?.day_date ?? null;
  // Throws (nothing written) when a raised line doesn't fit the free stock.
  await syncMealStock(db, "vleesje", mealId, day, demandLines("vleesje", meal), demandLines("vleesje", { template_vleesjes: clean }));

  const { error } = await db.from("plan_meals").update({ template_vleesjes: clean }).eq("id", mealId);
  if (error) throw error;
  await syncMealBuyLines(db, buyLineMeal(meal), (meal.template_vleesjes || []) as TemplateVleesje[], clean);
  revalidateStock();
}

/** Set the freezer vegetables a meal takes. Same model as vleesjes; the recipe
 *  ingredient each one `replaces` stays off the boodschappenlijstje. */
export async function setMealGroenten(mealId: string, groenten: TemplateGroente[]): Promise<void> {
  const db = getDb();
  const clean: TemplateGroente[] = (groenten || [])
    .map((g) => ({
      name: (g.name || "").trim(),
      unit: (g.unit || "").trim(),
      amount: Math.max(0, Math.round((Number(g.amount) || 0) * 1000) / 1000),
      replaces: (g.replaces || "").trim() || null,
    }))
    .filter((g) => g.name && g.amount > 0);

  const { data: meal } = await db.from("plan_meals").select(MEAL_FOR_BUY_LINES).eq("id", mealId).maybeSingle();
  if (!meal) throw new Error("Maaltijd niet gevonden");
  const day = (meal as any).day?.day_date ?? null;
  await syncMealStock(db, "groente", mealId, day, demandLines("groente", meal), demandLines("groente", { template_groenten: clean }));

  const { error } = await db.from("plan_meals").update({ template_groenten: clean }).eq("id", mealId);
  if (error) throw error;
  revalidateStock();
}

/** Set how many extra potjes to cook & freeze, per person (Robin / Amber). */
export async function setMealFreezer(mealId: string, robin: number, amber: number): Promise<void> {
  const db = getDb();
  const clamp = (n: number) => Math.max(0, Math.min(20, Math.floor(n) || 0));
  const want = { robin: clamp(robin), amber: clamp(amber) };
  // The portions go in the freezer on this meal's day (throws, changing
  // nothing, when lowering would drop a potje another day plans to eat).
  await syncCookedPortions(db, mealId, want, await listPortions());
  const { error } = await db
    .from("plan_meals")
    .update({ freezer_robin: want.robin, freezer_amber: want.amber })
    .eq("id", mealId);
  if (error) throw error;
  revalidateFreezer();
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
