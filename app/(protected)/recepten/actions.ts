"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/supabase/server";
import type { IngredientRow } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RecipeInput = {
  title: string;
  tags: string[];
  method: string | null;
  notes: string | null;
  ingredients: IngredientRow[];
};

async function saveIngredients(db: SupabaseClient, recipeId: string, rows: IngredientRow[]) {
  await db.from("ingredients").delete().eq("recipe_id", recipeId);
  const withId = rows.map((r) => ({ ...r, recipe_id: recipeId }));
  if (withId.length) {
    const { error } = await db.from("ingredients").insert(withId);
    if (error) throw error;
  }
}

// base_servings stays 2 (the household); fresh/freezer booleans are kept in sync
// with the tags so the rest of the app / data stays consistent.
function recipeFields(input: RecipeInput) {
  return {
    title: input.title.trim(),
    tags: input.tags,
    prep_minutes: null,
    base_servings: 2,
    uses_fresh_veg: input.tags.includes("verse groenten"),
    freezer_friendly: input.tags.includes("diepvriesvriendelijk"),
    method: input.method,
    notes: input.notes,
  };
}

export async function createRecipe(input: RecipeInput): Promise<string> {
  const db = getDb();
  const { data, error } = await db.from("recipes").insert(recipeFields(input)).select("id").single();
  if (error) throw error;
  await saveIngredients(db, data.id, input.ingredients);
  revalidatePath("/recepten");
  revalidatePath("/planning");
  return data.id as string;
}

export async function updateRecipe(id: string, input: RecipeInput): Promise<void> {
  const db = getDb();
  const { error } = await db
    .from("recipes")
    .update({ ...recipeFields(input), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  await saveIngredients(db, id, input.ingredients);
  revalidatePath("/recepten");
  revalidatePath("/planning");
}

export async function deleteRecipe(id: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from("recipes").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/recepten");
  revalidatePath("/planning");
}
