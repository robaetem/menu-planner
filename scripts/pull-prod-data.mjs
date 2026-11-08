/* Copy the PRODUCTION household data into the LOCAL Supabase stack so the local app looks like prod.
   Production is READ ONLY (fetch guard: any non-GET/HEAD to the prod URL throws).
   The local tables below are emptied and refilled with the same ids, in foreign-key order.
   Skipped on purpose: chat_data_changes, change_runs (chat history), and tables prod has but this repo does not.
   Recipe photos are copied by `db:pull-recipes`, not here.
   Usage: corepack pnpm db:pull-prod   (after `corepack pnpm db:start`) */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const ROOT = process.env.MENU_PLANNER_ENV_DIR ?? "/home/robin/Documents/menu-planner";
const LOCAL_HOSTS = ["127.0.0.1", "localhost", "100.123.162.82"];
// Parents first. Deleting runs in reverse.
const TABLES = [
  "recipe_tags", "recipes", "ingredients", "ingredient_categories", "ingredient_category_map",
  "household", "plan_modes", "potje_names", "vleesje_names", "groente_names",
  "potjes", "vleesjes", "groenten", "plan_days", "plan_meals",
  "freezer_portions", "freezer_reservations", "shopping_doc",
];

function readEnvFile(path) {
  return Object.fromEntries(
    readFileSync(path, "utf8").split("\n").map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")]; }),
  );
}
const envOf = (file) => {
  const env = readEnvFile(`${ROOT}/${file}`);
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error(`Missing Supabase URL or secret key in ${file}`);
  return env;
};
const prodEnv = envOf(".env.prod.local");
const localEnv = envOf(".env.local");
const prodUrl = new URL(prodEnv.NEXT_PUBLIC_SUPABASE_URL);
const localUrl = new URL(localEnv.NEXT_PUBLIC_SUPABASE_URL);

if (!LOCAL_HOSTS.includes(localUrl.hostname) || localUrl.host === prodUrl.host) {
  throw new Error(`Refusing to write: .env.local points at ${localUrl.host}, not the local stack`);
}

// Read-only guard: production may only see GET/HEAD.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input?.url ?? String(input);
  const method = String(init?.method ?? (typeof input === "object" ? input?.method : undefined) ?? "GET").toUpperCase();
  if (new URL(url).host === prodUrl.host && method !== "GET" && method !== "HEAD") {
    throw new Error(`READ-ONLY GUARD: blocked ${method} to production`);
  }
  return realFetch(input, init);
};

const client = (env) =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const prod = client(prodEnv);
const local = client(localEnv);

async function readAll(db, table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select("*").range(from, from + 999);
    if (error) throw new Error(`read ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

const data = {};
for (const t of TABLES) data[t] = await readAll(prod, t);

for (const t of [...TABLES].reverse()) {
  const sample = data[t][0] ?? (await readAll(local, t))[0];
  if (!sample) continue;
  const col = Object.keys(sample)[0];
  const { error } = await local.from(t).delete().not(col, "is", null);
  if (error) throw new Error(`clear ${t}: ${error.message}`);
}
for (const t of TABLES) {
  for (let i = 0; i < data[t].length; i += 500) {
    const { error } = await local.from(t).insert(data[t].slice(i, i + 500));
    if (error) throw new Error(`write ${t}: ${error.message}`);
  }
}

let ok = true;
console.log("table".padEnd(26), "prod".padStart(6), "local".padStart(6));
for (const t of TABLES) {
  const n = (await readAll(local, t)).length;
  if (n !== data[t].length) ok = false;
  console.log(t.padEnd(26), String(data[t].length).padStart(6), String(n).padStart(6), n === data[t].length ? "" : "MISMATCH");
}
if (!ok) { console.error("Row counts differ"); process.exit(1); }
