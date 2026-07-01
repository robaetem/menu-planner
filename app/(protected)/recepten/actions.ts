"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/supabase/server";
import { RECIPE_IMAGE_BUCKET, RECIPE_IMAGE_MAX_BYTES, RECIPE_IMAGE_TYPES } from "@/lib/recipes/images";
import type { IngredientRow } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RecipeInput = {
  title: string;
  tags: string[];
  method: string | null;
  notes: string | null;
  has_vleesje: boolean;
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
    // Writing "[vleesje]" in the title is enough to make it a template recipe.
    has_vleesje: input.has_vleesje || /\[vleesje\]/i.test(input.title),
    method: input.method,
    notes: input.notes,
  };
}

async function removeRecipeImageObject(db: SupabaseClient, path: string | null | undefined) {
  if (!path) return;
  await db.storage.from(RECIPE_IMAGE_BUCKET).remove([path]);
}

function getImageFile(formData: FormData): File {
  const value = formData.get("image");
  if (!(value instanceof File) || value.size === 0) {
    throw new Error("Geen foto geselecteerd.");
  }
  if (value.size > RECIPE_IMAGE_MAX_BYTES) {
    throw new Error("Foto is groter dan 5 MB.");
  }
  if (!RECIPE_IMAGE_TYPES[value.type]) {
    throw new Error("Gebruik een jpg, png, webp of gif.");
  }
  return value;
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

export async function uploadRecipeImage(recipeId: string, formData: FormData): Promise<void> {
  const file = getImageFile(formData);
  const db = getDb();
  const { data: recipe, error: recipeError } = await db
    .from("recipes")
    .select("image_path")
    .eq("id", recipeId)
    .single();
  if (recipeError) throw recipeError;

  const ext = RECIPE_IMAGE_TYPES[file.type];
  const path = `${recipeId}/${randomUUID()}.${ext}`;
  const body = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await db.storage.from(RECIPE_IMAGE_BUCKET).upload(path, body, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { error: updateError } = await db
    .from("recipes")
    .update({ image_path: path, updated_at: new Date().toISOString() })
    .eq("id", recipeId);
  if (updateError) {
    await removeRecipeImageObject(db, path);
    throw updateError;
  }

  await removeRecipeImageObject(db, recipe?.image_path);
  revalidatePath("/recepten");
}

export async function clearRecipeImage(recipeId: string): Promise<void> {
  const db = getDb();
  const { data: recipe, error: recipeError } = await db
    .from("recipes")
    .select("image_path")
    .eq("id", recipeId)
    .single();
  if (recipeError) throw recipeError;

  const { error } = await db
    .from("recipes")
    .update({ image_path: null, updated_at: new Date().toISOString() })
    .eq("id", recipeId);
  if (error) throw error;

  await removeRecipeImageObject(db, recipe?.image_path);
  revalidatePath("/recepten");
}

export async function deleteRecipe(id: string): Promise<void> {
  const db = getDb();
  const { data: recipe } = await db.from("recipes").select("image_path").eq("id", id).maybeSingle();
  const { error } = await db.from("recipes").delete().eq("id", id);
  if (error) throw error;
  await removeRecipeImageObject(db, recipe?.image_path);
  revalidatePath("/recepten");
  revalidatePath("/planning");
}
