"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/supabase/server";
import { computeShoppingList, formatQuantity } from "@/lib/planning/shopping";
import { buildShoppingDoc, type ShoppingGroup } from "@/lib/shopping/build-doc";
import { resolveCategories, FALLBACK_CATEGORY } from "@/lib/shopping/resolve-categories";
import type { Ingredient, PlanDayWithMeals, TemplateVleesje } from "@/lib/types";

/** Persist the editable boodschappenlijstje document (TipTap JSON). */
export async function saveShoppingDoc(content: unknown): Promise<void> {
  const db = getDb();
  const { data: existing } = await db.from("shopping_doc").select("id").limit(1).maybeSingle();
  if (existing) {
    const { error } = await db
      .from("shopping_doc")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await db.from("shopping_doc").insert({ content });
    if (error) throw error;
  }
  // No revalidatePath here: autosave must NOT refresh the route, or the saved
  // doc echoes back into the live editor and clobbers in-flight typing. The
  // editor owns the document; the generate flow reads fresh on navigation.
}

/** Aggregate the selected days into a categorised boodschappenlijstje and
 *  OVERWRITE the document. Pulls recipe ingredients + "te kopen" template
 *  vleesjes, asks the AI to categorise any new ingredient names, groups by the
 *  user's categories, and writes a fresh checkbox list. */
export async function generateShoppingList(dates: string[]): Promise<void> {
  const db = getDb();
  if (!dates.length) return;

  const [{ data: dayRows }, { data: recipeRows }] = await Promise.all([
    db
      .from("plan_days")
      .select("*, plan_meals(*, recipe:recipes(*))")
      .in("day_date", dates),
    db.from("recipes").select("id, ingredients(*)"),
  ]);

  const days: PlanDayWithMeals[] = (dayRows || []).map((d: any) => {
    const { plan_meals, ...rest } = d;
    return { ...rest, meals: plan_meals || [] };
  });
  const ingredientsByRecipe: Record<string, Ingredient[]> = Object.fromEntries(
    (recipeRows || []).map((r: any) => [r.id, r.ingredients || []]),
  );

  const result = computeShoppingList(days, ingredientsByRecipe);

  // Build a flat list of { name, qty-label, categoryKey } from recipe ingredients
  // plus the "te kopen" template vleesjes (counted pieces, merged by name).
  type Item = { name: string; label: string };
  const items: Item[] = result.all.map((l) => {
    const q = formatQuantity(l);
    return { name: l.name, label: q ? `${q} ${l.name}` : l.name };
  });

  // "Te kopen" template vleesjes: merge by name, keep first-seen casing.
  const buyVleesjes = new Map<string, { name: string; count: number }>();
  for (const day of days) {
    for (const meal of day.meals) {
      for (const v of (meal.template_vleesjes || []) as TemplateVleesje[]) {
        if (v.source !== "buy") continue;
        const name = v.name.trim();
        const key = name.toLowerCase();
        if (!key) continue;
        const prev = buyVleesjes.get(key);
        buyVleesjes.set(key, { name: prev?.name ?? name, count: (prev?.count ?? 0) + (Number(v.count) || 1) });
      }
    }
  }
  for (const { name, count } of buyVleesjes.values()) {
    items.push({ name, label: `${count} ${name}` });
  }

  // Categorise every distinct name (cached; AI fills the gaps).
  const allNames = items.map((i) => i.name);
  const catByName = await resolveCategories(db, allNames);

  // Order categories by the user's sort; unknown/Overig last.
  const { data: cats } = await db
    .from("ingredient_categories")
    .select("name, sort")
    .order("sort", { ascending: true });
  const order = (cats || []).map((c: any) => c.name as string);
  if (!order.includes(FALLBACK_CATEGORY)) order.push(FALLBACK_CATEGORY);

  const byCat = new Map<string, string[]>();
  // De-dupe identical labels (e.g. a buy-vleesje that also appears as an
  // ingredient) by lineKey-ish name within a category.
  for (const it of items) {
    const cat = catByName.get(it.name.trim().toLowerCase()) || FALLBACK_CATEGORY;
    const arr = byCat.get(cat) || [];
    arr.push(it.label);
    byCat.set(cat, arr);
  }

  const groups: ShoppingGroup[] = [];
  const emitted = new Set<string>();
  for (const cat of order) {
    if (emitted.has(cat)) continue;
    emitted.add(cat);
    const lines = byCat.get(cat);
    if (lines && lines.length) groups.push({ category: cat, lines: dedupe(lines) });
  }
  // Any category not in the ordered list (shouldn't happen, but be safe).
  for (const [cat, lines] of byCat) {
    if (!emitted.has(cat) && lines.length) groups.push({ category: cat, lines: dedupe(lines) });
  }

  const doc = buildShoppingDoc(groups);
  await saveShoppingDoc(doc);
  // Safe here (runs from Planning, not the editor): invalidate so the freshly
  // generated list shows when we navigate to the boodschappenlijstje.
  revalidatePath("/boodschappenlijstje");
}

function dedupe(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of lines) {
    const k = l.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out;
}
