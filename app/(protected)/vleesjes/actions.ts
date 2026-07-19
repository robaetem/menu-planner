"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/supabase/server";

function clampCount(n: number): number {
  return Math.max(0, Math.min(99, Math.floor(n) || 0));
}

/** Remember a vleesje name for the add/pick autocomplete (case-insensitively
 *  deduped). The history only ever grows — it survives the vleesje itself. */
export async function recordVleesjeName(name: string): Promise<void> {
  const t = name.trim();
  if (!t) return;
  const db = getDb();
  const { data: existing } = await db.from("vleesje_names").select("id").ilike("name", t).maybeSingle();
  if (existing) return;
  await db.from("vleesje_names").insert({ name: t });
}

export async function createVleesje(name: string, count: number): Promise<void> {
  const db = getDb();
  const t = name.trim();
  if (!t) return;
  const { count: n } = await db.from("vleesjes").select("id", { count: "exact", head: true });
  const { error } = await db.from("vleesjes").insert({
    name: t,
    count: clampCount(count),
    sort: n || 0,
  });
  if (error) throw error;
  await recordVleesjeName(t);
  revalidatePath("/vleesjes");
  revalidatePath("/diepvries");
  revalidatePath("/planning");
}

export async function deleteVleesje(id: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from("vleesjes").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/vleesjes");
  revalidatePath("/diepvries");
  revalidatePath("/planning");
}

export async function setVleesjeCount(id: string, value: number): Promise<void> {
  const db = getDb();
  const { error } = await db.from("vleesjes").update({ count: clampCount(value) }).eq("id", id);
  if (error) throw error;
  revalidatePath("/vleesjes");
  revalidatePath("/diepvries");
  revalidatePath("/planning");
}
