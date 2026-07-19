"use server";

import { revalidatePath } from "next/cache";
import { clampFreezerCount } from "@/lib/freezer/inventory";
import { getDb } from "@/lib/supabase/server";

async function recordGroenteName(name: string): Promise<void> {
  const db = getDb();
  const { data: existing } = await db.from("groente_names").select("id").ilike("name", name).maybeSingle();
  if (existing) return;
  const { error } = await db.from("groente_names").insert({ name });
  if (error) throw error;
}

export async function createGroente(name: string, count: number): Promise<void> {
  const db = getDb();
  const trimmed = name.trim();
  if (!trimmed) return;

  const { count: existingCount } = await db.from("groenten").select("id", { count: "exact", head: true });
  const { error } = await db.from("groenten").insert({
    name: trimmed,
    count: clampFreezerCount(count),
    sort: existingCount || 0,
  });
  if (error) throw error;

  await recordGroenteName(trimmed);
  revalidatePath("/diepvries");
}

export async function deleteGroente(id: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from("groenten").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/diepvries");
}

export async function setGroenteCount(id: string, value: number): Promise<void> {
  const db = getDb();
  const { error } = await db.from("groenten").update({ count: clampFreezerCount(value) }).eq("id", id);
  if (error) throw error;
  revalidatePath("/diepvries");
}
