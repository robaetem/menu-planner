// Server-side bookkeeping for counted freezer stock (vleesjes, groenten). The
// rules live in lib/freezer/stock.ts; this file loads rows and writes the
// changes those functions return. Only called from server code.

import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIso } from "@/lib/date";
import { resolveTitle } from "@/app/(protected)/planning/config";
import {
  mealStockLines,
  planFillShortages,
  planMealReservations,
  planTrimOverbooked,
  type FreezerStock,
  type MealDemand,
  type StockChange,
  type StockEntry,
  type StockLine,
  type StockReservation,
} from "./stock";

export type StockKind = "vleesje" | "groente";

const KIND = {
  vleesje: { table: "vleesjes", fk: "vleesje_id", demand: "template_vleesjes" },
  groente: { table: "groenten", fk: "groente_id", demand: "template_groenten" },
} as const;

export type { FreezerStock } from "./stock";

/** The freezer lines a meal wants, as stock lines. */
export const demandLines = mealStockLines;

/** Take reservations whose day has passed out of the freezer (idempotent). */
export async function settleFreezer(db: SupabaseClient): Promise<void> {
  const { error } = await db.rpc("settle_freezer_reservations", { p_today: todayIso() });
  if (error) throw error;
}

function mealTitle(m: any): string {
  const base = m?.recipe?.title ?? m?.freeform_title ?? m?.raw_text ?? "Maaltijd";
  return resolveTitle(base, m?.template_vleesjes);
}

/** Entries, open reservations and upcoming demand for one kind of stock. */
export async function loadStock(db: SupabaseClient, kind: StockKind): Promise<FreezerStock> {
  const k = KIND[kind];
  const today = todayIso();
  const [entriesRes, resRes, mealsRes] = await Promise.all([
    db.from(k.table).select("*").order("created_at", { ascending: true }),
    db
      .from("freezer_reservations")
      .select(
        `id, amount, meal_id, ${k.fk}, meal:plan_meals(freeform_title, raw_text, template_vleesjes, recipe:recipes(title), day:plan_days(day_date))`,
      )
      .not(k.fk, "is", null)
      .is("settled_at", null),
    db
      .from("plan_meals")
      .select(`id, sort, ${k.demand}, day:plan_days!inner(day_date)`)
      .gte("day.day_date", today),
  ]);
  if (entriesRes.error) throw entriesRes.error;
  if (resRes.error) throw resRes.error;
  if (mealsRes.error) throw mealsRes.error;

  const entries: StockEntry[] = (entriesRes.data || []).map((r: any) => ({
    id: r.id,
    name: (r.name || "").trim(),
    unit: kind === "vleesje" ? "" : r.unit || "",
    amount: Number(kind === "vleesje" ? r.count : (r.amount ?? r.count)) || 0,
    createdAt: r.created_at,
  }));
  const reservations: StockReservation[] = (resRes.data || []).map((r: any) => ({
    id: r.id,
    entryId: r[k.fk],
    mealId: r.meal_id,
    amount: Number(r.amount) || 0,
    day: r.meal?.day?.day_date ?? "",
    mealTitle: mealTitle(r.meal),
  }));
  const demands: MealDemand[] = (mealsRes.data || [])
    .map((m: any) => ({
      mealId: m.id,
      day: m.day?.day_date ?? "",
      sort: m.sort ?? 0,
      lines: demandLines(kind, m),
    }))
    .filter((d) => d.lines.length > 0);
  return { entries, reservations, demands };
}

async function applyChange(db: SupabaseClient, kind: StockKind, change: StockChange): Promise<void> {
  const fk = KIND[kind].fk;
  if (change.remove.length) {
    const { error } = await db.from("freezer_reservations").delete().in("id", change.remove);
    if (error) throw error;
  }
  for (const u of change.update) {
    const { error } = await db.from("freezer_reservations").update({ amount: u.amount }).eq("id", u.id);
    if (error) throw error;
  }
  if (change.insert.length) {
    const rows = change.insert.map((i) => ({ meal_id: i.mealId, [fk]: i.entryId, amount: i.amount }));
    const { error } = await db.from("freezer_reservations").insert(rows);
    if (error) throw error;
  }
}

/** Reserve a meal's new lines (strict: raising a line beyond the free stock
 *  throws before anything is written). Meals in the past keep what they had. */
export async function syncMealStock(
  db: SupabaseClient,
  kind: StockKind,
  mealId: string,
  mealDay: string | null,
  before: StockLine[],
  after: StockLine[],
): Promise<void> {
  if (mealDay && mealDay < todayIso()) return;
  await settleFreezer(db);
  const stock = await loadStock(db, kind);
  const change = planMealReservations(stock.entries, stock.reservations, mealId, before, after, { strict: true });
  await applyChange(db, kind, change);
  if (change.remove.length || change.update.length) await rebalanceStock(db, kind);
}

/** After stock changed by hand or a meal let go: trim reservations that no
 *  longer fit their entry, then fill upcoming shortages, earliest day first. */
export async function rebalanceStock(db: SupabaseClient, kind: StockKind): Promise<void> {
  let stock = await loadStock(db, kind);
  const trim = planTrimOverbooked(stock.entries, stock.reservations);
  if (trim.remove.length || trim.update.length) {
    await applyChange(db, kind, trim);
    stock = await loadStock(db, kind);
  }
  const fill = planFillShortages(stock.entries, stock.reservations, stock.demands);
  if (fill.insert.length) await applyChange(db, kind, fill);
}

/** An entry changed name or unit: its reservations no longer match the meals'
 *  lines, so they are released and the meals re-reserve by the new names. */
export async function releaseEntry(db: SupabaseClient, kind: StockKind, entryId: string): Promise<void> {
  const { error } = await db
    .from("freezer_reservations")
    .delete()
    .eq(KIND[kind].fk, entryId)
    .is("settled_at", null);
  if (error) throw error;
}
