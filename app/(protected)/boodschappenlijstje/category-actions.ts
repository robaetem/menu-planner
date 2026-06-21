"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/supabase/server";
import { categorizeNames } from "@/lib/ai/categorize";
import { FALLBACK_CATEGORY } from "@/lib/shopping/resolve-categories";

export async function createCategory(name: string): Promise<void> {
  const db = getDb();
  const t = name.trim();
  if (!t) return;
  const { count } = await db.from("ingredient_categories").select("id", { count: "exact", head: true });
  const { error } = await db
    .from("ingredient_categories")
    .insert({ name: t, sort: count || 0 })
    .select("id")
    .single();
  if (error && error.code !== "23505") throw error; // ignore duplicate name
  revalidatePath("/boodschappenlijstje");
}

export async function renameCategory(id: string, name: string): Promise<void> {
  const db = getDb();
  const t = name.trim();
  if (!t) return;
  const { error } = await db.from("ingredient_categories").update({ name: t }).eq("id", id);
  if (error) throw error;
  revalidatePath("/boodschappenlijstje");
}

/** Deleting a category nulls its map references (FK on delete set null), so those
 *  ingredients fall back to "Overig" until the next recompute. */
export async function deleteCategory(id: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from("ingredient_categories").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/boodschappenlijstje");
}

/** A user override for one ingredient name. Stored as source='user' so a later
 *  recompute never changes it. categoryId=null pins it to "Overig". */
export async function setIngredientCategory(name: string, categoryId: string | null): Promise<void> {
  const db = getDb();
  const key = name.trim().toLowerCase();
  if (!key) return;
  const { error } = await db
    .from("ingredient_category_map")
    .upsert(
      { name: key, category_id: categoryId, source: "user", updated_at: new Date().toISOString() },
      { onConflict: "name" },
    );
  if (error) throw error;
  revalidatePath("/boodschappenlijstje");
}

/** Re-ask the model to categorise every AI-assigned ingredient against the
 *  CURRENT category set (user overrides are left untouched). Run after adding or
 *  removing categories to keep things consistent. */
export async function recomputeCategories(): Promise<void> {
  const db = getDb();
  const [{ data: cats }, { data: map }] = await Promise.all([
    db.from("ingredient_categories").select("id, name"),
    db.from("ingredient_category_map").select("name, source").eq("source", "ai"),
  ]);
  const names = (map || []).map((m: any) => m.name as string);
  if (names.length === 0) {
    revalidatePath("/boodschappenlijstje");
    return;
  }
  const catNames = (cats || []).map((c: any) => c.name as string);
  const nameToId = new Map<string, string>((cats || []).map((c: any) => [c.name.toLowerCase(), c.id]));
  const guesses = await categorizeNames(names, catNames, FALLBACK_CATEGORY);

  const rows = names.map((n) => ({
    name: n,
    category_id: nameToId.get((guesses[n] ?? FALLBACK_CATEGORY).toLowerCase()) ?? null,
    source: "ai" as const,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await db.from("ingredient_category_map").upsert(rows, { onConflict: "name" });
  if (error) throw error;
  revalidatePath("/boodschappenlijstje");
}
