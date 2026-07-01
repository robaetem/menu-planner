import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TABLES = [
  "household",
  "recipes",
  "ingredients",
  "recipe_tags",
  "potjes",
  "potje_names",
  "plan_days",
  "plan_meals",
  "plan_modes",
  "shopping_doc",
  "ingredient_categories",
  "ingredient_category_map",
  "vleesjes",
  "vleesje_names",
];

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

async function dumpTable(db, table) {
  const pageSize = 1000;
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await db.from(table).select("*").range(from, to);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

const env = readEnvFile(".env.local");
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
}

const projectRef = new URL(url).hostname.split(".")[0];
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const startedAt = new Date();
const backup = {
  created_at: startedAt.toISOString(),
  project_ref: projectRef,
  tables: {},
};

for (const table of TABLES) {
  const rows = await dumpTable(db, table);
  backup.tables[table] = rows;
  console.log(`${table}: ${rows.length}`);
}

mkdirSync(".backups", { recursive: true });
const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
const file = join(".backups", `supabase-data-${projectRef}-${stamp}.json`);
writeFileSync(file, `${JSON.stringify(backup, null, 2)}\n`);
console.log(`Backup written to ${file}`);
