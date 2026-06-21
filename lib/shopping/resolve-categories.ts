import type { SupabaseClient } from "@supabase/supabase-js";
import { categorizeNames } from "@/lib/ai/categorize";

export const FALLBACK_CATEGORY = "Overig";

/** Resolve a category NAME for each ingredient name, keyed by lowercased name.
 *  Reads the cached ingredient_category_map; for names not yet cached, asks the
 *  model (one batched call), then persists the guesses as source='ai'. Existing
 *  rows (incl. user overrides) are never touched. Degrades to "Overig" if the AI
 *  is unavailable, so the list always generates. */
export async function resolveCategories(
  db: SupabaseClient,
  names: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const lower = [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))];
  if (lower.length === 0) return out;

  const [{ data: cats }, { data: map }] = await Promise.all([
    db.from("ingredient_categories").select("id, name"),
    db.from("ingredient_category_map").select("name, category_id").in("name", lower),
  ]);
  const idToName = new Map<string, string>((cats || []).map((c: any) => [c.id, c.name]));
  const nameToId = new Map<string, string>((cats || []).map((c: any) => [c.name.toLowerCase(), c.id]));

  const cached = new Map<string, string | null>((map || []).map((m: any) => [m.name, m.category_id]));
  for (const [n, cid] of cached) {
    out.set(n, (cid && idToName.get(cid)) || FALLBACK_CATEGORY);
  }

  const missing = lower.filter((n) => !cached.has(n));
  if (missing.length === 0) return out;

  const catNames = (cats || []).map((c: any) => c.name as string);
  const guesses = await categorizeNames(missing, catNames, FALLBACK_CATEGORY);

  const rows = missing.map((n) => {
    const catName = guesses[n] ?? FALLBACK_CATEGORY;
    out.set(n, catName);
    return { name: n, category_id: nameToId.get(catName.toLowerCase()) ?? null, source: "ai" as const };
  });
  // Upsert so a concurrent generate doesn't collide on the unique name.
  await db.from("ingredient_category_map").upsert(rows, { onConflict: "name", ignoreDuplicates: true });
  return out;
}
