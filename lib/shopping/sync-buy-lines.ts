import type { SupabaseClient } from "@supabase/supabase-js";
import type { Assignee, TemplateVleesje } from "@/lib/types";
import { applyBuyLines, buyLineLabel, type BuyLineChange } from "./buy-lines";
import { shoppingDocPatch } from "./document-sections";
import { parseOriginIndex } from "./origins";
import { FALLBACK_CATEGORY } from "./resolve-categories";

/** Where a buy vleesje lands when its name has no cached category yet. */
const MEAT_CATEGORY = "Vlees & Vis";

export type BuyLineMeal = {
  label: string;
  date: string;
  assignee: Assignee | null;
};

function buyTotals(vleesjes: TemplateVleesje[]): Map<string, { name: string; count: number }> {
  const m = new Map<string, { name: string; count: number }>();
  for (const v of vleesjes || []) {
    if (v.source !== "buy") continue;
    const name = (v.name || "").trim();
    const key = name.toLowerCase();
    if (!key) continue;
    const prev = m.get(key);
    m.set(key, { name: prev?.name ?? name, count: (prev?.count ?? 0) + (Number(v.count) || 0) });
  }
  return m;
}

/** Category per lowercased name, from the cached map only (no AI): a buy
 *  vleesje is meat, so unknown names go under the meat heading. */
async function buyCategories(db: SupabaseClient, names: string[]): Promise<Map<string, string>> {
  const lower = [...new Set(names.map((n) => n.toLowerCase()))];
  const [{ data: cats }, { data: map }] = await Promise.all([
    db.from("ingredient_categories").select("id, name"),
    db.from("ingredient_category_map").select("name, category_id").in("name", lower),
  ]);
  const idToName = new Map<string, string>((cats || []).map((c: any) => [c.id, c.name]));
  const fallback = [...idToName.values()].includes(MEAT_CATEGORY) ? MEAT_CATEGORY : FALLBACK_CATEGORY;
  const out = new Map<string, string>();
  for (const n of lower) out.set(n, fallback);
  for (const m of map || []) {
    const cat = m.category_id && idToName.get(m.category_id);
    if (cat) out.set(m.name, cat);
  }
  return out;
}

/** Put a meal's "te kopen" vleesjes on the generated boodschappenlijstje right
 *  away: lines it had before come off, its current ones go on. Unchanged lines
 *  are left alone, so ticking one off survives saving the meal again. */
export async function syncMealBuyLines(
  db: SupabaseClient,
  meal: BuyLineMeal,
  before: TemplateVleesje[],
  after: TemplateVleesje[],
): Promise<void> {
  const oldTotals = buyTotals(before);
  const newTotals = buyTotals(after);
  const change: BuyLineChange = { remove: [], add: [] };
  const added: { name: string; count: number }[] = [];
  for (const key of new Set([...oldTotals.keys(), ...newTotals.keys()])) {
    const o = oldTotals.get(key);
    const n = newTotals.get(key);
    if (o && n && o.count === n.count) continue;
    if (o) change.remove.push({ label: buyLineLabel(o.name, o.count), meal: meal.label, date: meal.date });
    if (n) added.push(n);
  }
  if (!change.remove.length && !added.length) return;

  const categories = await buyCategories(db, added.map((a) => a.name));
  for (const a of added) {
    change.add.push({
      label: buyLineLabel(a.name, a.count),
      name: a.name,
      count: a.count,
      category: categories.get(a.name.toLowerCase()) ?? FALLBACK_CATEGORY,
      origin: { meal: meal.label, date: meal.date, amount: String(a.count), assignee: meal.assignee },
    });
  }

  const { data: row } = await db
    .from("shopping_doc")
    .select("id, generated_content, generated_origins")
    .order("id")
    .limit(1)
    .maybeSingle();
  const next = applyBuyLines(row?.generated_content ?? null, parseOriginIndex(row?.generated_origins), change);
  const patch = shoppingDocPatch("generated", next.doc, new Date().toISOString(), next.origins);
  const { error } = row
    ? await db.from("shopping_doc").update(patch).eq("id", row.id)
    : await db.from("shopping_doc").insert(patch);
  if (error) throw error;
}
