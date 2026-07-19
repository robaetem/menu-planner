"use server";

import { revalidatePath } from "next/cache";
import {
  legacyCountForAmount,
  normalizeGroenteAmount,
  normalizeGroenteUnit,
  type GroenteUnit,
} from "@/lib/freezer/inventory";
import { getDb } from "@/lib/supabase/server";

async function recordGroenteName(name: string): Promise<void> {
  const db = getDb();
  const { data: existing } = await db.from("groente_names").select("id").ilike("name", name).maybeSingle();
  if (existing) return;
  const { error } = await db.from("groente_names").insert({ name });
  if (error) throw error;
}

function groentePatch(name: string, amount: number, unit: GroenteUnit) {
  const normalizedAmount = normalizeGroenteAmount(amount);
  return {
    name: name.trim(),
    amount: normalizedAmount,
    unit: normalizeGroenteUnit(unit),
    count: legacyCountForAmount(normalizedAmount),
  };
}

export async function createGroente(name: string, amount: number, unit: GroenteUnit): Promise<void> {
  const db = getDb();
  const patch = groentePatch(name, amount, unit);
  if (!patch.name) return;

  const { count: existingCount } = await db.from("groenten").select("id", { count: "exact", head: true });
  const { error } = await db.from("groenten").insert({
    ...patch,
    sort: existingCount || 0,
  });
  if (error) throw error;

  await recordGroenteName(patch.name);
  revalidatePath("/diepvries");
}

export async function updateGroente(id: string, name: string, amount: number, unit: GroenteUnit): Promise<void> {
  const db = getDb();
  const patch = groentePatch(name, amount, unit);
  if (!patch.name) return;
  const { error } = await db.from("groenten").update(patch).eq("id", id);
  if (error) throw error;
  await recordGroenteName(patch.name);
  revalidatePath("/diepvries");
}

export async function deleteGroente(id: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from("groenten").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/diepvries");
}
