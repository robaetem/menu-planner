"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/supabase/server";

/** The stable key stored in recipes.tags[] (lowercased label). */
function toValue(label: string): string {
  return label.trim().toLowerCase();
}

export async function createTag(label: string): Promise<void> {
  const db = getDb();
  const l = label.trim();
  if (!l) return;
  const value = toValue(l);
  const { count } = await db.from("recipe_tags").select("id", { count: "exact", head: true });
  const { error } = await db.from("recipe_tags").insert({ value, label: l, sort: count || 0 });
  // 23505 = unique violation (tag already exists) — silently ignore.
  if (error && (error as { code?: string }).code !== "23505") throw error;
  revalidatePath("/recepten");
  revalidatePath("/planning");
}

/** Rename a tag. Only `label` changes — `value` stays stable so recipe references survive. */
export async function updateTag(id: string, label: string): Promise<void> {
  const db = getDb();
  const l = label.trim();
  if (!l) return;
  const { error } = await db.from("recipe_tags").update({ label: l }).eq("id", id);
  if (error) throw error;
  revalidatePath("/recepten");
  revalidatePath("/planning");
}

/** Delete a tag and strip its value from every recipe that carries it. */
export async function deleteTag(id: string): Promise<void> {
  const db = getDb();
  const { data: tag } = await db.from("recipe_tags").select("value").eq("id", id).maybeSingle();
  const { error } = await db.from("recipe_tags").delete().eq("id", id);
  if (error) throw error;

  if (tag?.value) {
    const { data: recipes } = await db
      .from("recipes")
      .select("id, tags")
      .contains("tags", [tag.value]);
    for (const r of recipes || []) {
      const next = ((r.tags as string[]) || []).filter((t) => t !== tag.value);
      await db.from("recipes").update({ tags: next }).eq("id", r.id);
    }
  }
  revalidatePath("/recepten");
  revalidatePath("/planning");
}
