"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/supabase/server";

function clampCount(n: number): number {
  return Math.max(0, Math.min(99, Math.floor(n) || 0));
}

/** Remember a potje name for the add-potje autocomplete (case-insensitively
 *  deduped). The history only ever grows — it survives the potje itself. */
export async function recordPotjeName(name: string): Promise<void> {
  const t = name.trim();
  if (!t) return;
  const db = getDb();
  const { data: existing } = await db.from("potje_names").select("id").ilike("name", t).maybeSingle();
  if (existing) return;
  await db.from("potje_names").insert({ name: t });
}

export async function createPotje(name: string, robin: number, amber: number): Promise<void> {
  const db = getDb();
  const t = name.trim();
  if (!t) return;
  const { count } = await db.from("potjes").select("id", { count: "exact", head: true });
  const { error } = await db.from("potjes").insert({
    name: t,
    robin_count: clampCount(robin),
    amber_count: clampCount(amber),
    sort: count || 0,
  });
  if (error) throw error;
  await recordPotjeName(t);
  revalidatePath("/potjes");
  revalidatePath("/planning");
}

export async function deletePotje(id: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from("potjes").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/potjes");
  revalidatePath("/planning");
}

export async function setPotjeCount(id: string, who: "robin" | "amber", value: number): Promise<void> {
  const db = getDb();
  const patch = who === "robin" ? { robin_count: clampCount(value) } : { amber_count: clampCount(value) };
  const { error } = await db.from("potjes").update(patch).eq("id", id);
  if (error) throw error;
  revalidatePath("/potjes");
  revalidatePath("/planning");
}
