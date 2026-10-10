/* Sanity checks for the core logic against the design worked-example.
   Run: corepack pnpm dlx tsx scripts/test-logic.ts  */
import { parseIngredientsText, toIngredientRows, serializeIngredient } from "../lib/recipes/ingredient-parser";
import { serializePlannedIngredient } from "../lib/planning/ingredient-quantity";
import { computeShoppingList, formatQuantity } from "../lib/planning/shopping";
import { parseMealLine } from "../lib/planning/meal-parser";
import { rankRecipes } from "../lib/recipes/ranker";
import { getRecipeImageUrl, isRemoteRecipeImagePath, normalizeRecipeImageUrl } from "../lib/recipes/images";
import { shoppingDocPatch } from "../lib/shopping/document-sections";
import { isPlainJson, toPlainJson } from "../lib/shopping/plain-json";
import { editorUnit as mapEditorUnit, UNIT_OPTIONS } from "../lib/planning/units";
import { dinersFor } from "../lib/planning/assignment";
import { blockedPotjes, freezerTimeline, pickPortions, potjeChoices, type Portion } from "../lib/freezer/potjes";
import {
  buildOriginIndex,
  containsWord,
  EMPTY_ORIGIN_INDEX,
  matchOriginLine,
  mergeOriginLines,
  normalizeLineText,
  sortOrigins,
} from "../lib/shopping/origins";
import { applyBuyLines, parseBuyText } from "../lib/shopping/buy-lines";
import {
  clampFreezerCount,
  formatGroenteQuantity,
  legacyCountForAmount,
  normalizeFreezerTab,
  normalizeGroenteAmount,
  normalizeGroenteUnit,
} from "../lib/freezer/inventory";

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
// An editor autosave must NOT clear the provenance recorded at generation time.
eq("generated autosave leaves origins alone", shoppingDocPatch("generated", generatedDoc, shoppingTimestamp), {
  generated_content: generatedDoc,
  updated_at: shoppingTimestamp,
});
eq("regeneration writes document and origins together", shoppingDocPatch("generated", generatedDoc, shoppingTimestamp, EMPTY_ORIGIN_INDEX), {
  generated_content: generatedDoc,
  generated_origins: EMPTY_ORIGIN_INDEX,
  updated_at: shoppingTimestamp,
});

// ---- Server Action serialization of a TipTap document -------------------------
// ProseMirror builds `attrs` with Object.create(null); React silently drops such
// objects when they cross a Server Action boundary, which used to lose every
// checkbox tick and heading level on autosave.
const pmAttrs = Object.assign(Object.create(null), { checked: true });
const pmHeadingAttrs = Object.assign(Object.create(null), { level: 2 });
const pmDoc = {
  type: "doc",
  content: [
    { type: "heading", attrs: pmHeadingAttrs, content: [{ type: "text", text: "Groenten & Fruit" }] },
    {
      type: "taskList",
      content: [
        { type: "taskItem", attrs: pmAttrs, content: [{ type: "paragraph", content: [{ type: "text", text: "600 gram gehakt" }] }] },
      ],
    },
  ],
};
eq("raw TipTap doc is NOT server-action safe", isPlainJson(pmDoc), false);
eq("converted doc is server-action safe", isPlainJson(toPlainJson(pmDoc)), true);
eq("checkbox tick survives the conversion", (toPlainJson(pmDoc) as any).content[1].content[0].attrs, { checked: true });
eq("heading level survives the conversion", (toPlainJson(pmDoc) as any).content[0].attrs, { level: 2 });
eq("conversion keeps the text intact", JSON.stringify(toPlainJson(pmDoc)), JSON.stringify(pmDoc));

// ---- freezer navigation + manual count bounds ----
eq("known freezer tab preserved", normalizeFreezerTab("groenten"), "groenten");
eq("unknown freezer tab falls back safely", normalizeFreezerTab("recipes"), "potjes");
eq("freezer count floors decimals", clampFreezerCount(3.9), 3);
eq("freezer count clamps below zero", clampFreezerCount(-2), 0);
eq("freezer count clamps above maximum", clampFreezerCount(120), 99);
eq("vegetable amount keeps three decimal places", normalizeGroenteAmount(12.3456), 12.346);
eq("vegetable amount clamps below zero", normalizeGroenteAmount(-4), 0);
eq("known vegetable unit preserved", normalizeGroenteUnit("gram"), "gram");
eq("unknown vegetable unit falls back safely", normalizeGroenteUnit("liter"), "stuk");
eq("legacy count keeps decimal stock visible", legacyCountForAmount(0.5), 1);
eq("gram display uses Dutch decimal comma", formatGroenteQuantity(750.5, "gram"), "750,5 gram");
eq("pieces display pluralizes", formatGroenteQuantity(2, "stuk"), "2 stuks");
eq("single package stays singular", formatGroenteQuantity(1, "verpakking"), "1 verpakking");

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
  { id: "d1", day_date: "2026-07-28", meals: [{ recipe_id: "w", recipe: { id: "w", title: "Wortelpuree met hamburgers" }, assignee: "both", diner_count: 2, diner_keys: ["robin", "amber"], freezer_robin: 1, freezer_amber: 1, from_freezer: false }] },
  { id: "d2", day_date: "2026-08-01", meals: [{ recipe_id: "b", recipe: { id: "b", title: "Balletjes in tomatensaus" }, assignee: "both", diner_count: 2, diner_keys: ["robin", "amber"], freezer_robin: 1, freezer_amber: 1, from_freezer: false }] },
  { id: "d-spoon", day_date: "2026-08-02", meals: [{ recipe_id: "s", recipe: { id: "s", title: "Lepeltest" }, assignee: "amber", diner_count: 2, diner_keys: ["robin", "amber"], freezer_robin: 0, freezer_amber: 0, from_freezer: false }] },
  { id: "d3", day_date: "2026-08-03", meals: [{ recipe_id: null, recipe: null, raw_text: "Amber en Robin Potje", assignee: "both", diner_count: 2, diner_keys: ["robin", "amber"], freezer_robin: 0, freezer_amber: 0, from_freezer: true }] },
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

// ---- "tenen" as a unit (2 tenen knoflook) ------------------------------------
const garlicRows = toIngredientRows(parseIngredientsText("4 tenen knoflook"), 2)
  .map((r) => ({ ...r, recipe_id: "g", id: "knoflook" }));
eq("tenen parses to the teen unit", { a: garlicRows[0].amount, u: garlicRows[0].unit }, { a: 2, u: "teen" });
eq("editor keeps teen instead of collapsing it to stuk", mapEditorUnit("tenen"), "teen");
eq("teen is offered in the recipe editor", UNIT_OPTIONS.includes("teen"), true);
eq("editor still collapses units it cannot offer", mapEditorUnit("blik"), "stuk");
eq("editor keeps gram spellings canonical", mapEditorUnit("grammen"), "gram");
const garlicDays: any[] = [
  { id: "g1", day_date: "2026-07-28", meals: [{ recipe_id: "g", recipe: { id: "g", title: "Aioli" }, assignee: "both", diner_count: 2, diner_keys: ["robin", "amber"], freezer_robin: 0, freezer_amber: 0, from_freezer: false }] },
  { id: "g2", day_date: "2026-07-29", meals: [{ recipe_id: "g", recipe: { id: "g", title: "Aioli" }, assignee: "robin", diner_count: 1, diner_keys: ["robin"], freezer_robin: 0, freezer_amber: 0, from_freezer: false }] },
];
const garlicRes = computeShoppingList(garlicDays, { g: garlicRows as any[] });
eq("garlic totals pluralize to tenen", formatQuantity(garlicRes.all[0]), "6 tenen");
eq("a single clove stays singular", formatQuantity({ total: 1, unit: "teen", hasNumeric: true }), "1 teen");
eq("teen totals round up like other counted units", formatQuantity({ total: 2.5, unit: "teen", hasNumeric: true }), "3 tenen");
eq("planned detail line pluralizes tenen", serializePlannedIngredient(garlicRows[0] as any, bothPlusTwo), "8 tenen knoflook");

// ---- shopping line provenance (the (i) tooltip) ------------------------------
const label = (l: any) => { const q = formatQuantity(l); return q ? `${q} ${l.name}` : l.name; };
const originIndex = buildOriginIndex(res.all, label);
const gehaktLine = originIndex.lines.find((l) => l.name === "gehakt")!;
eq("gehakt line remembers its buy total", gehaktLine.total, "1000 g");
eq("gehakt came from one meal", gehaktLine.origins.length, 1);
eq("gehakt origin names the recipe and the day", { m: gehaktLine.origins[0].meal, d: gehaktLine.origins[0].date }, { m: "Balletjes in tomatensaus", d: "2026-08-01" });

// aardappelen is the merged case: 900 g total, from two different days.
const potatoLine = originIndex.lines.find((l) => l.name === "aardappelen")!;
eq("merged line lists both meals", potatoLine.origins.length, 2);
eq("merged line splits the amounts per meal", sortOrigins(potatoLine.origins).map((o) => `${o.amount} · ${o.meal} · ${o.date}`), [
  "600 g · Wortelpuree met hamburgers · 2026-07-28",
  "300 g · Balletjes in tomatensaus · 2026-08-01",
]);
eq("per-meal shares add up to the buy total", potatoLine.total, "900 g");
eq("assignee is recorded for a single-person meal", originIndex.lines.find((l) => l.name === "paprikapoeder")!.origins[0].assignee, "amber");
eq("excluded ingredients get no origins", originIndex.lines.some((l) => l.name === "servet"), false);

// The editor looks the index up by the text of the rendered line.
eq("exact line text matches", matchOriginLine("1000 g gehakt", originIndex)?.name, "gehakt");
eq("hand-edited quantity still matches on the name", matchOriginLine("1 kg gehakt", originIndex)?.name, "gehakt");
eq("a ticked-off line still matches", matchOriginLine("  900 g aardappelen  ", originIndex)?.name, "aardappelen");
eq("an unrelated line has no origins", matchOriginLine("wc-papier", originIndex), null);
eq("a heading has no origins", matchOriginLine("Groenten & Fruit", originIndex), null);
eq("an empty line has no origins", matchOriginLine("   ", originIndex), null);
eq("no index means no lookups", matchOriginLine("1000 g gehakt", null), null);

// A bought vleesje that reads exactly like an ingredient line shares the one
// rendered line, so their origins have to be merged onto it.
const dupLines = mergeOriginLines([
  { label: "2 Kalkoenbrochette", name: "Kalkoenbrochette", total: "2", origins: [{ meal: "Koude tomaten", date: "2026-07-28", amount: "2", assignee: "both" }] },
  { label: "2 Kalkoenbrochette", name: "Kalkoenbrochette", total: "2", origins: [{ meal: "Salade met perzik", date: "2026-07-29", amount: "2", assignee: "both" }] },
]);
eq("duplicate labels collapse to one line", dupLines.length, 1);
eq("duplicate labels keep both origins", dupLines[0].origins.map((o) => o.meal), ["Koude tomaten", "Salade met perzik"]);

// Name matching must not fire on a substring of a longer word.
eq("whole-word match", containsWord("3 stuk uien", "uien"), true);
eq("substring is not a match", containsWord("3 stuk uien", "ui"), false);
eq("accented names match", containsWord("2 stuk courgette", "courgette"), true);
eq("line text normalizes bullets and casing", normalizeLineText("- 600 Gram Gehakt."), "600 gram gehakt");

// ---- potjes: frozen portions --------------------------------------------------
const portion = (p: Partial<Portion> & { id: string }): Portion => ({
  who: "robin",
  name: "Curry",
  sourceMealId: null,
  cookOn: null,
  frozenOn: null,
  eatenByMealId: null,
  eatenOn: null,
  ...p,
});
const TODAY = "2026-09-25"; // Friday
// What the "Potje diepvries" menu offers depends on the day you plan for.
const stock = [
  portion({ id: "h", name: "Stoofvlees", frozenOn: "2026-09-01" }),
  portion({ id: "i", name: "Stoofvlees", who: "amber", frozenOn: "2026-09-01" }),
  portion({ id: "j", name: "Lasagne", sourceMealId: "wed", cookOn: "2026-09-30" }),
  portion({ id: "k", name: "Lasagne", who: "amber", sourceMealId: "wed", cookOn: "2026-09-30" }),
  portion({ id: "l", name: "Soep", eatenByMealId: "x", eatenOn: "2026-09-26" }),
];
const names = (date: string, who: "both" | "robin" | "amber") => potjeChoices(stock, date, who, TODAY).map((c) => c.name);
eq("before Wednesday only what is in the freezer", names("2026-09-30", "robin"), ["Stoofvlees"]);
eq("Friday also offers what Wednesday cooks", names("2026-10-02", "robin"), ["Stoofvlees", "Lasagne"]);
eq("a reserved portion is not offered again", names("2026-10-02", "robin").includes("Soep"), false);
eq("Samen needs one of each", names("2026-10-02", "both"), ["Stoofvlees", "Lasagne"]);
const lasagne = potjeChoices(stock, "2026-10-02", "robin", TODAY).find((c) => c.name === "Lasagne")!;
eq("an upcoming dish says when it is ready", { inFreezer: lasagne.inFreezer, next: lasagne.nextReadyOn }, { inFreezer: 0, next: "2026-10-01" });
eq("pick reserves one per person", pickPortions(stock, "stoofvlees", "2026-09-26", "both", TODAY)?.map((p) => p.id), ["h", "i"]);
eq("can't pick a dish before it is cooked", pickPortions(stock, "Lasagne", "2026-09-30", "robin", TODAY), null);
const fifo = [
  portion({ id: "new", frozenOn: "2026-09-20" }),
  portion({ id: "old", frozenOn: "2026-08-01" }),
];
eq("the oldest portion is eaten first", pickPortions(fifo, "Curry", TODAY, "robin", TODAY)?.[0].id, "old");

// Nothing silently disappears: what can't be picked is listed with why.
const blocked = (date: string, who: "both" | "robin" | "amber") =>
  blockedPotjes(stock, date, who, TODAY).map((b) => `${b.name}/${b.who}/${b.reason.kind}`);
eq("a reserved portion shows as planned", blocked("2026-10-02", "robin"), ["Soep/robin/planned"]);
eq("a dish cooked later shows as not ready yet", blocked("2026-09-30", "robin"), ["Lasagne/robin/later", "Soep/robin/planned"]);
eq("Samen: a dish only one person has says so", blockedPotjes(
  [portion({ id: "m", name: "Chili", frozenOn: "2026-09-01" })], TODAY, "both", TODAY,
).map((b) => `${b.name}/${b.who}/${b.reason.kind}`), ["Chili/amber/partner"]);

// How the freezer evolves over the plan: cooked in on its day, gone the evening it is eaten.
{
  const tl = freezerTimeline(
    [
      portion({ id: "t1", frozenOn: "2026-09-01" }),
      portion({ id: "t2", frozenOn: "2026-09-01", eatenByMealId: "eat", eatenOn: "2026-09-26" }),
      portion({ id: "t3", who: "amber", sourceMealId: "cook", cookOn: "2026-09-27" }),
      portion({ id: "t4", who: "amber", sourceMealId: "nodate" }),
    ],
    ["2026-09-25", "2026-09-26", "2026-09-27"],
  );
  eq("timeline starts with what is in the freezer", tl.start, { robin: 2, amber: 0 });
  eq("timeline counts each evening", tl.days.map((d) => [d.counts.robin, d.counts.amber]), [[2, 0], [1, 0], [1, 1]]);
  eq("timeline lists what changed that day", tl.days.map((d) => d.changes.map((c) => `${c.who}${c.delta}`)), [[], ["robin-1"], ["amber1"]]);
}

// Dropping in another box re-scales the ingredients for whoever eats it now.
eq("Samen box scales for two", dinersFor("both"), { diner_keys: ["robin", "amber"], diner_count: 2 });
eq("Amber box scales for one", dinersFor("amber"), { diner_keys: ["amber"], diner_count: 1 });
eq("Robin box scales for one", dinersFor("robin"), { diner_keys: ["robin"], diner_count: 1 });
// A Samen meal dragged into the Amber box must halve a per-serving ingredient.
const movedRow = toIngredientRows(parseIngredientsText("400 gram Pasta"), 2)[0];
const asSamen = { ...dinersFor("both"), freezer_robin: 0, freezer_amber: 0 };
const asAmber = { ...dinersFor("amber"), freezer_robin: 0, freezer_amber: 0 };
eq("pasta for Samen", serializePlannedIngredient(movedRow as any, asSamen), "400 g Pasta");
eq("pasta after the drop into Amber", serializePlannedIngredient(movedRow as any, asAmber), "200 g Pasta");

// ---- te kopen vleesjes -> boodschappenlijstje ----
eq("buy text: '4 worsten'", parseBuyText(" 4  worsten "), { name: "worsten", count: 4 });
eq("buy text: '2x hamburger'", parseBuyText("2x hamburger"), { name: "hamburger", count: 2 });
eq("buy text: no number is 1", parseBuyText("kipfilet"), { name: "kipfilet", count: 1 });
eq("buy text: empty is null", parseBuyText("  "), null);
{
  const origin = { meal: "Spinazie", date: "2026-10-10", amount: "4", assignee: "both" };
  const itemTexts = (doc: any) =>
    doc.content.map((n: any) =>
      n.type === "taskList" ? n.content.map((i: any) => i.content[0].content[0].text) : `${n.type}:${n.content?.[0]?.text ?? ""}`,
    );
  const empty = { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Uit je planning" }] }, { type: "paragraph", content: [] }] };
  const add = applyBuyLines(empty, null, {
    remove: [],
    add: [{ label: "4 worsten", name: "worsten", count: 4, category: "Vlees & Vis", origin }],
  });
  eq("buy lines: added under its category, blank paragraph gone", itemTexts(add.doc), ["heading:Uit je planning", "heading:Vlees & Vis", ["4 worsten"]]);
  eq("buy lines: origin recorded", add.origins.lines.map((l) => [l.label, l.origins[0].meal]), [["4 worsten", "Spinazie"]]);
  const withOther = applyBuyLines(add.doc, add.origins, {
    remove: [],
    add: [{ label: "1 kip", name: "kip", count: 1, category: "Vlees & Vis", origin }],
  });
  eq("buy lines: second line joins the same heading", itemTexts(withOther.doc), ["heading:Uit je planning", "heading:Vlees & Vis", ["4 worsten", "1 kip"]]);
  const changed = applyBuyLines(withOther.doc, withOther.origins, {
    remove: [{ label: "4 worsten", meal: "Spinazie", date: "2026-10-10" }],
    add: [{ label: "5 worsten", name: "worsten", count: 5, category: "Vlees & Vis", origin: { ...origin, amount: "5" } }],
  });
  eq("buy lines: changed count replaces the old line", itemTexts(changed.doc), ["heading:Uit je planning", "heading:Vlees & Vis", ["1 kip", "5 worsten"]]);
  const cleared = applyBuyLines(changed.doc, changed.origins, {
    remove: [{ label: "1 kip", meal: "Spinazie", date: "2026-10-10" }, { label: "5 worsten", meal: "Spinazie", date: "2026-10-10" }],
    add: [],
  });
  eq("buy lines: emptied heading goes, list stays editable", itemTexts(cleared.doc), ["heading:Uit je planning", "paragraph:"]);
  eq("buy lines: origins gone with the lines", cleared.origins.lines, []);
  eq("buy lines: input doc untouched", itemTexts(empty), ["heading:Uit je planning", "paragraph:"]);
}

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
