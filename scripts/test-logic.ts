/* Sanity checks for the core logic against the design worked-example.
   Run: corepack pnpm dlx tsx scripts/test-logic.ts  */
import { parseIngredientsText, toIngredientRows, serializeIngredient } from "../lib/recipes/ingredient-parser";
import { computeShoppingList, formatQuantity } from "../lib/planning/shopping";
import { parseMealLine } from "../lib/planning/meal-parser";
import { rankRecipes } from "../lib/recipes/ranker";

let failures = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failures++;
  console.log(`${ok ? "✅" : "❌"} ${label}${ok ? "" : `\n     got=${g}\n    want=${w}`}`);
}

// ---- ingredient parsing + normalization (authored for base_servings=2) ----
const wortelText = `Robin 2 / Amber 1 stuk hamburger
350 g wortels
300 g aardappelen`;
const wortelRows = toIngredientRows(parseIngredientsText(wortelText), 2).map((r) => ({ ...r, recipe_id: "w", id: r.name }));
eq("hamburger per_person", wortelRows[0], {
  name: "hamburger", unit: "stuk", scaling: "per_person", amount: null, amount_max: null,
  amounts_per_person: { robin: 2, amber: 1 }, is_fresh: false, sort: 0, recipe_id: "w", id: "hamburger",
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

// round-trip serialize back to typed lines (base 2)
eq("serialize wortels round-trip", serializeIngredient(wortelRows[1] as any, 2), "350 g wortels");
eq("serialize gehakt range round-trip", serializeIngredient(ballRows[0] as any, 2), "450-500 g gehakt");
eq("serialize hamburger per_person", serializeIngredient(wortelRows[0] as any, 2), "Robin 2 / Amber 1 stuk hamburger");
eq("serialize fixed", serializeIngredient(ballRows[2] as any, 2), "vast: 1 blik tomatenstukjes");

// ---- meal line parsing ----
eq("parse '+ 2 potjes'", parseMealLine("Quiche lorrain met bloemkool + 2 potjes"), { cook: null, freezer_servings: 2, title: "Quiche lorrain met bloemkool" });
eq("parse 'Robin maakt: ... + 2potjes'", parseMealLine("Robin maakt: Wortelpuree met hamburgers + 2potjes"), { cook: "Robin", freezer_servings: 2, title: "Wortelpuree met hamburgers" });
eq("parse 'Amber potje' (no freezer count)", parseMealLine("Amber potje"), { cook: null, freezer_servings: 0, title: "Amber potje" });

// ---- shopping aggregation (the worked example) ----
const ingredientsByRecipe: Record<string, any[]> = {
  w: wortelRows,
  b: ballRows,
};
const days: any[] = [
  { id: "d1", meals: [{ recipe_id: "w", recipe: { id: "w", title: "Wortelpuree met hamburgers" }, diner_count: 2, diner_keys: ["robin", "amber"], freezer_servings: 2, from_freezer: false }] },
  { id: "d2", meals: [{ recipe_id: "b", recipe: { id: "b", title: "Balletjes in tomatensaus" }, diner_count: 2, diner_keys: ["robin", "amber"], freezer_servings: 2, from_freezer: false }] },
  { id: "d3", meals: [{ recipe_id: null, recipe: null, raw_text: "Amber en Robin Potje", diner_count: 2, diner_keys: ["robin", "amber"], freezer_servings: 0, from_freezer: true }] },
];
const res = computeShoppingList(days, ingredientsByRecipe);
const byKey = Object.fromEntries(res.all.map((l) => [l.key, formatQuantity(l)]));
eq("aardappelen merged 900 g", byKey["aardappelen|gram"], "900 g");
eq("wortels 700 g", byKey["wortels|gram"], "700 g");
eq("hamburger 3 stuk (Robin>Amber, potjes ignored)", byKey["hamburger|stuk"], "3 stuk");
eq("gehakt 1000 g (amount_max)", byKey["gehakt|gram"], "1000 g");
eq("bonen 3 blik", byKey["bonen in tomatensaus|blik"], "3 blik");
eq("tomatenstukjes 1 blik (fixed)", byKey["tomatenstukjes|blik"], "1 blik");
eq("from_freezer ignored", res.mealsFromFreezer, 1);
eq("meals counted", res.mealsCounted, 2);

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
