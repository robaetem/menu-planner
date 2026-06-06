"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/supabase/server";
import { parseIngredientsText, toIngredientRows } from "@/lib/recipes/ingredient-parser";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RecipeInput = {
  title: string;
  tags: string[];
  prep_minutes: number | null;
  uses_fresh_veg: boolean;
  freezer_friendly: boolean;
  base_servings: number;
  method: string | null;
  notes: string | null;
  ingredientsText: string;
};

async function saveIngredients(db: SupabaseClient, recipeId: string, text: string, baseServings: number) {
  const rows = toIngredientRows(parseIngredientsText(text), baseServings).map((r) => ({
    ...r,
    recipe_id: recipeId,
  }));
  await db.from("ingredients").delete().eq("recipe_id", recipeId);
  if (rows.length) {
    const { error } = await db.from("ingredients").insert(rows);
    if (error) throw error;
  }
}

export async function createRecipe(input: RecipeInput): Promise<string> {
  const db = getDb();
  const { data, error } = await db
    .from("recipes")
    .insert({
      title: input.title.trim(),
      tags: input.tags,
      prep_minutes: input.prep_minutes,
      uses_fresh_veg: input.uses_fresh_veg,
      freezer_friendly: input.freezer_friendly,
      base_servings: input.base_servings,
      method: input.method,
      notes: input.notes,
    })
    .select("id")
    .single();
  if (error) throw error;
  await saveIngredients(db, data.id, input.ingredientsText, input.base_servings);
  revalidatePath("/recepten");
  return data.id as string;
}

export async function updateRecipe(id: string, input: RecipeInput): Promise<void> {
  const db = getDb();
  const { error } = await db
    .from("recipes")
    .update({
      title: input.title.trim(),
      tags: input.tags,
      prep_minutes: input.prep_minutes,
      uses_fresh_veg: input.uses_fresh_veg,
      freezer_friendly: input.freezer_friendly,
      base_servings: input.base_servings,
      method: input.method,
      notes: input.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
  await saveIngredients(db, id, input.ingredientsText, input.base_servings);
  revalidatePath("/recepten");
}

export async function deleteRecipe(id: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from("recipes").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/recepten");
}
