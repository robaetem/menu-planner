/* Copy recipes from PRODUCTION into the LOCAL Supabase stack.
   Production is only read; the local database and `recipe-images` bucket are written.
   Copies: recipe_tags, recipes, ingredients, and the recipe photos.
   Usage: corepack pnpm db:pull-recipes   (after `corepack pnpm db:start`) */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const BUCKET = "recipe-images";

function readEnvFile(path) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1)];
      }),
  );
}

function connect(path) {
  const env = readEnvFile(path);
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error(`Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in ${path}`);
  }
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { url: new URL(env.NEXT_PUBLIC_SUPABASE_URL), db };
}

const prod = connect(".env.prod.local");
const local = connect(".env.local");

// Never write anywhere but the local stack.
if (!["127.0.0.1", "localhost"].includes(local.url.hostname)) {
  throw new Error(`Refusing to write: .env.local points at ${local.url.host}, not the local stack`);
}

async function readAll(table) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await prod.db.from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw new Error(`read ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function upsert(table, rows, onConflict = "id") {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await local.db.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`write ${table}: ${error.message}`);
  }
  console.log(`${table}: ${rows.length}`);
}

// Tags are keyed by `value` (recipes.tags[] stores values); ids differ per database.
const tags = (await readAll("recipe_tags")).map(({ id: _id, ...tag }) => tag);
await upsert("recipe_tags", tags, "value");

const recipes = await readAll("recipes");
await upsert("recipes", recipes);

// Drop local ingredient lines that no longer exist in production for these recipes
// (recipes created only locally keep their ingredients).
const ingredients = await readAll("ingredients");
const keep = new Set(ingredients.map((i) => i.id));
const prodRecipeIds = new Set(recipes.map((r) => r.id));
const { data: localIngredients, error } = await local.db.from("ingredients").select("id, recipe_id");
if (error) throw new Error(`read local ingredients: ${error.message}`);
const stale = localIngredients
  .filter((i) => prodRecipeIds.has(i.recipe_id) && !keep.has(i.id))
  .map((i) => i.id);
if (stale.length) {
  const { error: delError } = await local.db.from("ingredients").delete().in("id", stale);
  if (delError) throw new Error(`delete stale ingredients: ${delError.message}`);
}
await upsert("ingredients", ingredients);

let images = 0;
// image_path is either an external URL (served as-is) or an object path in the bucket.
const storedImages = recipes
  .map((r) => r.image_path)
  .filter((path) => path && !/^https?:\/\//.test(path));
for (const path of storedImages) {
  const { data: file, error: dlError } = await prod.db.storage.from(BUCKET).download(path);
  if (dlError) {
    console.warn(`image ${path}: ${dlError.message}`);
    continue;
  }
  const { error: upError } = await local.db.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (upError) throw new Error(`upload ${path}: ${upError.message}`);
  images++;
}
console.log(`${BUCKET}: ${images} files`);
