"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/supabase/server";

type Who = "amber" | "robin";

/** The stable key stored in plan_days.amber_mode / robin_mode (lowercased label). */
function toValue(label: string): string {
  return label.trim().toLowerCase();
}

export async function createMode(who: Who, label: string): Promise<void> {
  const db = getDb();
  const l = label.trim();
  if (!l) return;
  const value = toValue(l);
  const { count } = await db
    .from("plan_modes")
    .select("id", { count: "exact", head: true })
    .eq("who", who);
  const { error } = await db.from("plan_modes").insert({ who, value, label: l, sort: count || 0 });
  // 23505 = unique violation (mode already exists for this person) — silently ignore.
  if (error && (error as { code?: string }).code !== "23505") throw error;
  revalidatePath("/planning");
}

/** Rename a mode. Only `label` changes — `value` stays stable so day references survive. */
export async function updateMode(id: string, label: string): Promise<void> {
  const db = getDb();
  const l = label.trim();
  if (!l) return;
  const { error } = await db.from("plan_modes").update({ label: l }).eq("id", id);
  if (error) throw error;
  revalidatePath("/planning");
}

/** Delete a mode and clear it (back to "Thuis") from every day that used it. */
export async function deleteMode(id: string): Promise<void> {
  const db = getDb();
  const { data: mode } = await db.from("plan_modes").select("who, value").eq("id", id).maybeSingle();
  const { error } = await db.from("plan_modes").delete().eq("id", id);
  if (error) throw error;

  if (mode?.value) {
    const column = mode.who === "amber" ? "amber_mode" : "robin_mode";
    const { error: clearErr } = await db
      .from("plan_days")
      .update({ [column]: null })
      .eq(column, mode.value);
    if (clearErr) throw clearErr;
  }
  revalidatePath("/planning");
}
