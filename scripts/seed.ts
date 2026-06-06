/* Seed realistic demo data (8 recipes + the Notion "5–9 juni" period).
   Uses the SAME parser/normalizer as the app so stored values are consistent.
   Run: corepack pnpm dlx tsx scripts/seed.ts            */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { parseIngredientsText, toIngredientRows } from "../lib/recipes/ingredient-parser";
import { parseMealLine } from "../lib/planning/meal-parser";
import { addIsoDays } from "../lib/date";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

type R = {
  title: string;
  prep: number | null;
  fresh: boolean;
  freezer: boolean;
  tags: string[];
  base: number;
  ingredients: string;
  notes?: string;
};

const RECIPES: R[] = [
  {
    title: "Wortelpuree met hamburgers",
    prep: 30,
    fresh: true,
    freezer: false,
    tags: ["klassieker"],
    base: 2,
    ingredients: `Robin 2 / Amber 1 stuk hamburger
350 g wortels *
300 g aardappelen`,
  },
  {
    title: "Balletjes in tomatensaus",
    prep: 40,
    fresh: false,
    freezer: true,
    tags: ["comfort", "klassieker"],
    base: 2,
    ingredients: `450-500 g gehakt
1,5 blik bonen in tomatensaus
vast: 1 blik tomatenstukjes
150 g aardappelen`,
  },
  {
    title: "Wraps met ratatouille en ei",
    prep: 20,
    fresh: true,
    freezer: false,
    tags: ["snel", "vegetarisch"],
    base: 2,
    ingredients: `Robin 3 / Amber 2 stuk wraps
1 stuk courgette *
1 stuk aubergine *
2 stuk paprika *
Robin 2 / Amber 1 stuk ei
vast: 1 blik passata`,
  },
  {
    title: "Quiche lorraine met bloemkool",
    prep: 45,
    fresh: false,
    freezer: true,
    tags: ["oven", "klassieker"],
    base: 2,
    ingredients: `150 g spekblokjes
4 stuk eieren
200 ml room
1 stuk bloemkool *
100 g geraspte kaas
vast: 1 rol bladerdeeg`,
  },
  {
    title: "Spaghetti bolognese",
    prep: 35,
    fresh: false,
    freezer: true,
    tags: ["pasta", "klassieker", "comfort"],
    base: 2,
    ingredients: `250 g spaghetti
500 g gehakt
vast: 1 blik tomatenstukjes
1 stuk ui *
2 teen knoflook`,
  },
  {
    title: "Kip curry met rijst",
    prep: 30,
    fresh: true,
    freezer: false,
    tags: ["snel", "kip"],
    base: 2,
    ingredients: `Robin 2 / Amber 1 stuk kipfilet
250 g rijst
1 blik kokosmelk
2 el currypasta
2 stuk paprika *`,
  },
  {
    title: "Tomatensoep met balletjes",
    prep: 25,
    fresh: true,
    freezer: true,
    tags: ["soep", "snel"],
    base: 2,
    ingredients: `1 kg tomaten *
1 stuk ui *
vast: 1 blik tomatenstukjes
200 g gehakt
500 ml bouillon`,
  },
  {
    title: "Stoofvlees met frietjes",
    prep: 150,
    fresh: false,
    freezer: true,
    tags: ["traag", "comfort", "klassieker"],
    base: 2,
    ingredients: `800 g stoofvlees
2 stuk ui
1 fles bruin bier
1 kg frietjes`,
  },
];

async function main() {
  console.log("Clearing existing recipes + periods…");
  await db.from("periods").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await db.from("recipes").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  const idByTitle: Record<string, string> = {};
  for (const r of RECIPES) {
    const { data: rec, error } = await db
      .from("recipes")
      .insert({
        title: r.title,
        prep_minutes: r.prep,
        uses_fresh_veg: r.fresh,
        freezer_friendly: r.freezer,
        tags: r.tags,
        base_servings: r.base,
        notes: r.notes ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    idByTitle[r.title] = rec.id;
    const rows = toIngredientRows(parseIngredientsText(r.ingredients), r.base).map((x) => ({ ...x, recipe_id: rec.id }));
    if (rows.length) {
      const { error: e2 } = await db.from("ingredients").insert(rows);
      if (e2) throw e2;
    }
    console.log(`  + ${r.title} (${rows.length} ingrediënten)`);
  }

  console.log("Creating period 5–9 juni…");
  const start = "2026-06-05";
  const { data: period, error: pe } = await db
    .from("periods")
    .insert({ start_date: start, title: null })
    .select("id")
    .single();
  if (pe) throw pe;

  const DAYS: { note: string | null; meal: { raw: string; recipe?: string; from_freezer?: boolean } | null }[] = [
    { note: "Amber vrije middag, naar Cézar", meal: { raw: "Wraps met ratatouille en ei", recipe: "Wraps met ratatouille en ei" } },
    { note: "Amber vrije middag", meal: { raw: "Quiche lorraine met bloemkool + 2 potjes", recipe: "Quiche lorraine met bloemkool" } },
    { note: "Amber 24u", meal: { raw: "Robin maakt: Wortelpuree met hamburgers + 2 potjes", recipe: "Wortelpuree met hamburgers" } },
    { note: null, meal: { raw: "Balletjes in tomatensaus + 2 potjes", recipe: "Balletjes in tomatensaus" } },
    { note: "Amber 24u", meal: { raw: "Amber en Robin Potje", from_freezer: true } },
  ];

  for (let i = 0; i < DAYS.length; i++) {
    const d = DAYS[i];
    const { data: day, error: de } = await db
      .from("plan_days")
      .insert({ period_id: period.id, day_date: addIsoDays(start, i), note: d.note, sort: i })
      .select("id")
      .single();
    if (de) throw de;
    if (d.meal) {
      const parsed = parseMealLine(d.meal.raw);
      const { error: me } = await db.from("plan_meals").insert({
        plan_day_id: day.id,
        recipe_id: d.meal.recipe ? idByTitle[d.meal.recipe] : null,
        raw_text: d.meal.raw,
        freeform_title: parsed.title,
        cook: parsed.cook,
        freezer_servings: parsed.freezer_servings,
        from_freezer: !!d.meal.from_freezer,
        sort: 0,
      });
      if (me) throw me;
    }
    console.log(`  + ${addIsoDays(start, i)} ${d.meal ? d.meal.raw : "(geen maaltijd)"}`);
  }

  console.log("\nSeed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
