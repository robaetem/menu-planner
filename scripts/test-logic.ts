/* Sanity checks for the core logic against the design worked-example.
   Run: corepack pnpm dlx tsx scripts/test-logic.ts  */
import { parseIngredientsText, toIngredientRows, serializeIngredient } from "../lib/recipes/ingredient-parser";
import { serializePlannedIngredient } from "../lib/planning/ingredient-quantity";
import { computeShoppingList, formatQuantity } from "../lib/planning/shopping";
import { parseMealLine } from "../lib/planning/meal-parser";
import { rankRecipes } from "../lib/recipes/ranker";
import { getRecipeImageUrl, isRemoteRecipeImagePath, normalizeRecipeImageUrl } from "../lib/recipes/images";
import { shoppingDocPatch } from "../lib/shopping/document-sections";
import { clampFreezerCount, normalizeFreezerTab } from "../lib/freezer/inventory";

let failures = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failures++;
  console.log(`${ok ? "✅" : "❌"} ${label}${ok ? "" : `\n     got=${g}\n    want=${w}`}`);
}

// ---- recipe image URLs ----
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
eq("storage image path -> public Supabase URL", getRecipeImageUrl("recipe-id/photo.jpg"), "https://example.supabase.co/storage/v1/object/public/recipe-images/recipe-id/photo.jpg");
eq("remote image URL preserved", getRecipeImageUrl(" https://images.example.com/pasta.jpg?size=large "), "https://images.example.com/pasta.jpg?size=large");
eq("remote image path detected", isRemoteRecipeImagePath("https://images.example.com/pasta.jpg"), true);
eq("invalid image URL rejected", normalizeRecipeImageUrl("javascript:alert(1)"), null);

// ---- shopping document section isolation ----
const shoppingTimestamp = "2026-07-18T00:00:00.000Z";
const manualDoc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "koffie" }] }] };
const generatedDoc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "wortels" }] }] };
eq("manual shopping save only patches permanent content", shoppingDocPatch("manual", manualDoc, shoppingTimestamp), {
  content: manualDoc,
  updated_at: shoppingTimestamp,
});
eq("generated shopping save cannot patch manual content", shoppingDocPatch("generated", generatedDoc, shoppingTimestamp), {
  generated_content: generatedDoc,
  updated_at: shoppingTimestamp,
});

// ---- freezer navigation + manual count bounds ----
eq("known freezer tab preserved", normalizeFreezerTab("groenten"), "groenten");
eq("unknown freezer tab falls back safely", normalizeFreezerTab("recipes"), "potjes");
eq("freezer count floors decimals", clampFreezerCount(3.9), 3);
eq("freezer count clamps below zero", clampFreezerCount(-2), 0);
eq("freezer count clamps above maximum", clampFreezerCount(120), 99);

// ---- ingredient parsing + normalization (authored for base_servings=2) ----
const wortelText = `Robin 2 / Amber 1 stuk hamburger
350 g wortels
300 g aardappelen`;
const wortelRows = toIngredientRows(parseIngredientsText(wortelText), 2).map((r) => ({ ...r, recipe_id: "w", id: r.name }));
eq("hamburger per_person", wortelRows[0], {
  name: "hamburger", unit: "stuk", scaling: "per_person", amount: null, amount_max: null,
  amounts_per_person: { robin: 2, amber: 1 }, is_fresh: false, include_in_shopping: true, sort: 0, recipe_id: "w", id: "hamburger",
});
eq("wortels per_serving normalized 175", { a: wortelRows[1].amount, u: wortelRows[1].unit, s: wortelRows[1].scaling }, { a: 175, u: "g", s: "per_serving" });
eq("aardappelen per_serving normalized 150", wortelRows[2].amount, 150);

const ballText = `450-500 g gehakt
1,5 blik bonen in tomatensaus
vast: 1 blik tomatenstukjes
150 g aardappelen`;
const ballRows = toIngredientRows(parseIngredientsText(ballText), 2).map((r) => ({ ...r, recipe_id: "b", id: r.name }));
eq("gehakt range normalized", { a: ballRows[0].amount, m: ballRows[0].amount_max, u: ballRows[0].unit }, { a: 225, m: 250, u: "g" });
eq("bonen normalized 0.75", ballRows[1].amount, 0.75);
eq("tomatenstukjes fixed not divided", { a: ballRows[2].amount, s: ballRows[2].scaling }, { a: 1, s: "fixed" });
eq("aardappelen balletjes 75", ballRows[3].amount, 75);

const spoonText = `2 koffielepels paprikapoeder
2 theelepels zout`;
const spoonRows = toIngredientRows(parseIngredientsText(spoonText), 2).map((r) => ({ ...r, recipe_id: "s", id: r.name }));
eq("koffielepels parse canonical", { a: spoonRows[0].amount, u: spoonRows[0].unit }, { a: 1, u: "koffielepel" });
eq("theelepels parse canonical", { a: spoonRows[1].amount, u: spoonRows[1].unit }, { a: 1, u: "theelepel" });

// round-trip serialize back to typed lines (base 2)
eq("serialize wortels round-trip", serializeIngredient(wortelRows[1] as any, 2), "350 g wortels");
eq("serialize gehakt range round-trip", serializeIngredient(ballRows[0] as any, 2), "450-500 g gehakt");
eq("serialize hamburger per_person", serializeIngredient(wortelRows[0] as any, 2), "Robin 2 / Amber 1 stuk hamburger");
eq("serialize fixed", serializeIngredient(ballRows[2] as any, 2), "vast: 1 blik tomatenstukjes");

// planned details show the total amount to cook (diners + extra potjes, each
// potje sized for the person it's cooked for)
const bothPlusTwo = { diner_count: 2, diner_keys: ["robin", "amber"], freezer_robin: 1, freezer_amber: 1 };
const amberPlusTwo = { diner_count: 1, diner_keys: ["amber"], freezer_robin: 1, freezer_amber: 1 };
const scampiRow = {
  ...toIngredientRows(parseIngredientsText("125 gram Gepelde scampi's"), 2)[0],
  unit: "gram",
  recipe_id: "p",
  id: "scampi",
};
eq("planned scampi doubles for 2 diners + 2 potjes", serializePlannedIngredient(scampiRow as any, bothPlusTwo), "250 gram Gepelde scampi's");
eq("planned per-serving total", serializePlannedIngredient(wortelRows[1] as any, bothPlusTwo), "700 g wortels");
eq("planned per-person total", serializePlannedIngredient(wortelRows[0] as any, bothPlusTwo), "6 stuk hamburger");
// Amber eats (1) + a Robin potje (2) + an Amber potje (1) = 4
eq("planned single-diner + per-person potjes", serializePlannedIngredient(wortelRows[0] as any, amberPlusTwo), "4 stuk hamburger");
eq("planned range total", serializePlannedIngredient(ballRows[0] as any, bothPlusTwo), "900-1000 g gehakt");
eq("planned fixed amount unchanged", serializePlannedIngredient(ballRows[2] as any, bothPlusTwo), "vast: 1 blik tomatenstukjes");

// ---- meal line parsing ----
eq("parse '+ 2 potjes'", parseMealLine("Quiche lorrain met bloemkool + 2 potjes"), { cook: null, freezer_servings: 2, title: "Quiche lorrain met bloemkool" });
eq("parse 'Robin maakt: ... + 2potjes'", parseMealLine("Robin maakt: Wortelpuree met hamburgers + 2potjes"), { cook: "Robin", freezer_servings: 2, title: "Wortelpuree met hamburgers" });
eq("parse 'Amber potje' (no freezer count)", parseMealLine("Amber potje"), { cook: null, freezer_servings: 0, title: "Amber potje" });

// ---- shopping aggregation (the worked example) ----
const ingredientsByRecipe: Record<string, any[]> = {
  w: [...wortelRows, {
    id: "servet",
    recipe_id: "w",
    name: "servet",
    unit: "stuk",
    scaling: "fixed",
    amount: 1,
    amount_max: null,
    amounts_per_person: {},
    is_fresh: false,
    include_in_shopping: false,
    sort: 99,
  }],
  b: ballRows,
  s: spoonRows,
};
const days: any[] = [
  { id: "d1", meals: [{ recipe_id: "w", recipe: { id: "w", title: "Wortelpuree met hamburgers" }, diner_count: 2, diner_keys: ["robin", "amber"], freezer_robin: 1, freezer_amber: 1, from_freezer: false }] },
  { id: "d2", meals: [{ recipe_id: "b", recipe: { id: "b", title: "Balletjes in tomatensaus" }, diner_count: 2, diner_keys: ["robin", "amber"], freezer_robin: 1, freezer_amber: 1, from_freezer: false }] },
  { id: "d-spoon", meals: [{ recipe_id: "s", recipe: { id: "s", title: "Lepeltest" }, diner_count: 2, diner_keys: ["robin", "amber"], freezer_robin: 0, freezer_amber: 0, from_freezer: false }] },
  { id: "d3", meals: [{ recipe_id: null, recipe: null, raw_text: "Amber en Robin Potje", diner_count: 2, diner_keys: ["robin", "amber"], freezer_robin: 0, freezer_amber: 0, from_freezer: true }] },
];
const res = computeShoppingList(days, ingredientsByRecipe);
const byKey = Object.fromEntries(res.all.map((l) => [l.key, formatQuantity(l)]));
eq("aardappelen merged 900 g", byKey["aardappelen|gram"], "900 g");
eq("wortels 700 g", byKey["wortels|gram"], "700 g");
eq("hamburger 6 stuk (Robin>Amber, potjes add one extra round)", byKey["hamburger|stuk"], "6 stuk");
eq("gehakt 1000 g (amount_max)", byKey["gehakt|gram"], "1000 g");
eq("bonen 3 blik", byKey["bonen in tomatensaus|blik"], "3 blik");
eq("tomatenstukjes 1 blik (fixed)", byKey["tomatenstukjes|blik"], "1 blik");
eq("koffielepel summed and pluralized", byKey["paprikapoeder|koffielepel"], "2 koffielepels");
eq("theelepel summed and pluralized", byKey["zout|theelepel"], "2 theelepels");
eq("excluded ingredient ignored", byKey["servet|stuk"], undefined);
eq("from_freezer ignored", res.mealsFromFreezer, 1);
eq("meals counted", res.mealsCounted, 3);

// ---- ranker ----
const recipes: any[] = [
  { id: "1", title: "Snelle wraps", tags: ["snel", "vegetarisch"], prep_minutes: 15, uses_fresh_veg: true, freezer_friendly: false, ingredients: [{ name: "wrap" }, { name: "paprika" }], notes: "", cook_count: 0 },
  { id: "2", title: "Stoofvlees", tags: ["traag", "vriezer"], prep_minutes: 120, uses_fresh_veg: false, freezer_friendly: true, ingredients: [{ name: "rundvlees" }], notes: "", cook_count: 5 },
  { id: "3", title: "Groentecurry", tags: ["vegetarisch"], prep_minutes: 30, uses_fresh_veg: true, freezer_friendly: true, ingredients: [{ name: "courgette" }, { name: "wortel" }], notes: "", cook_count: 1 },
];
const r1 = rankRecipes(recipes, "iets snel voor warm weer").map((r) => r.title);
eq("ranker: 'snel warm' -> Snelle wraps first", r1[0], "Snelle wraps");
const r2 = rankRecipes(recipes, "10 recepten met verse groenten").map((r) => r.title);
eq("ranker: 'verse groenten' includes fresh-veg recipes", r2.includes("Snelle wraps") && r2.includes("Groentecurry") && !r2.includes("Stoofvlees"), true);
const r3 = rankRecipes(recipes, "vriezer");
eq("ranker: 'vriezer' -> Stoofvlees first", r3[0].title, "Stoofvlees");

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
