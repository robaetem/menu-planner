/* Seed demo data for the single rolling plan: 8 recipes + a few days from today
   with assigned meals (Samen / Amber / Robin), modes, potjes and potje-diepvries.
   Run: corepack pnpm dlx tsx scripts/seed.ts */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { parseIngredientsText, toIngredientRows } from "../lib/recipes/ingredient-parser";
import { addIsoDays, todayIso } from "../lib/date";

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
};

const RECIPES: R[] = [
  { title: "Wortelpuree met hamburgers", prep: 30, fresh: true, freezer: false, tags: ["klassieker"], base: 2,
    ingredients: `Robin 2 / Amber 1 stuk hamburger\n350 g wortels *\n300 g aardappelen` },
  { title: "Balletjes in tomatensaus", prep: 40, fresh: false, freezer: true, tags: ["comfort", "klassieker"], base: 2,
    ingredients: `450-500 g gehakt\n1,5 blik bonen in tomatensaus\nvast: 1 blik tomatenstukjes\n150 g aardappelen` },
  { title: "Wraps met ratatouille en ei", prep: 20, fresh: true, freezer: false, tags: ["snel", "vegetarisch"], base: 2,
    ingredients: `Robin 3 / Amber 2 stuk wraps\n1 stuk courgette *\n1 stuk aubergine *\n2 stuk paprika *\nRobin 2 / Amber 1 stuk ei\nvast: 1 blik passata` },
  { title: "Quiche lorraine met bloemkool", prep: 45, fresh: false, freezer: true, tags: ["oven", "klassieker"], base: 2,
    ingredients: `150 g spekblokjes\n4 stuk eieren\n200 ml room\n1 stuk bloemkool *\n100 g geraspte kaas\nvast: 1 rol bladerdeeg` },
  { title: "Spaghetti bolognese", prep: 35, fresh: false, freezer: true, tags: ["pasta", "klassieker", "comfort"], base: 2,
    ingredients: `250 g spaghetti\n500 g gehakt\nvast: 1 blik tomatenstukjes\n1 stuk ui *\n2 teen knoflook` },
  { title: "Kip curry met rijst", prep: 30, fresh: true, freezer: false, tags: ["snel", "kip"], base: 2,
    ingredients: `Robin 2 / Amber 1 stuk kipfilet\n250 g rijst\n1 blik kokosmelk\n2 el currypasta\n2 stuk paprika *` },
  { title: "Tomatensoep met balletjes", prep: 25, fresh: true, freezer: true, tags: ["soep", "snel"], base: 2,
    ingredients: `1 kg tomaten *\n1 stuk ui *\nvast: 1 blik tomatenstukjes\n200 g gehakt\n500 ml bouillon` },
  { title: "Stoofvlees met frietjes", prep: 150, fresh: false, freezer: true, tags: ["traag", "comfort", "klassieker"], base: 2,
    ingredients: `800 g stoofvlees\n2 stuk ui\n1 fles bruin bier\n1 kg frietjes` },
];

type Assignee = "both" | "amber" | "robin";
function dinersFor(a: Assignee) {
  if (a === "amber") return { keys: ["amber"], count: 1 };
  if (a === "robin") return { keys: ["robin"], count: 1 };
  return { keys: ["robin", "amber"], count: 2 };
}

type MealSpec = { assignee: Assignee; recipe?: string; potje?: boolean; potjes?: number };
type DaySpec = { offset: number; amber_mode?: string; robin_mode?: string; meals: MealSpec[] };

const PLAN: DaySpec[] = [
  { offset: 0, amber_mode: "Vrije middag", robin_mode: "Leuven", meals: [{ assignee: "both", recipe: "Wraps met ratatouille en ei" }] },
  { offset: 1, meals: [{ assignee: "amber", potje: true }, { assignee: "robin", potje: true }] },
  { offset: 2, amber_mode: "24 uur", meals: [{ assignee: "amber", potje: true }, { assignee: "robin", recipe: "Wortelpuree met hamburgers", potjes: 2 }] },
  { offset: 3, meals: [{ assignee: "both", recipe: "Balletjes in tomatensaus", potjes: 2 }] },
];

async function main() {
  console.log("Clearing recipes + plan_days…");
  await db.from("plan_days").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await db.from("recipes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await db.from("household").update({ plan_horizon: null }).neq("id", "00000000-0000-0000-0000-000000000000");

  const idByTitle: Record<string, string> = {};
  for (const r of RECIPES) {
    const { data: rec, error } = await db
      .from("recipes")
      .insert({ title: r.title, prep_minutes: r.prep, uses_fresh_veg: r.fresh, freezer_friendly: r.freezer, tags: r.tags, base_servings: r.base })
      .select("id")
      .single();
    if (error) throw error;
    idByTitle[r.title] = rec.id;
    const rows = toIngredientRows(parseIngredientsText(r.ingredients), r.base).map((x) => ({ ...x, recipe_id: rec.id }));
    if (rows.length) {
      const { error: e2 } = await db.from("ingredients").insert(rows);
      if (e2) throw e2;
    }
    console.log(`  + ${r.title} (${rows.length})`);
  }

  const today = todayIso();
  console.log(`Creating plan days from ${today}…`);
  for (const day of PLAN) {
    const date = addIsoDays(today, day.offset);
    const { data: d, error: de } = await db
      .from("plan_days")
      .insert({ day_date: date, amber_mode: day.amber_mode ?? null, robin_mode: day.robin_mode ?? null, sort: day.offset })
      .select("id")
      .single();
    if (de) throw de;
    let sort = 0;
    for (const m of day.meals) {
      const dn = dinersFor(m.assignee);
      const { error: me } = await db.from("plan_meals").insert({
        plan_day_id: d.id,
        assignee: m.assignee,
        from_freezer: !!m.potje,
        recipe_id: m.recipe ? idByTitle[m.recipe] : null,
        freeform_title: m.potje ? "Potje diepvries" : m.recipe ?? "Gerecht",
        raw_text: m.potje ? "Potje diepvries" : m.recipe ?? "",
        diner_keys: dn.keys,
        diner_count: dn.count,
        freezer_servings: m.potjes ?? 0,
        sort: sort++,
      });
      if (me) throw me;
    }
    console.log(`  + ${date} (${day.meals.length} maaltijd(en))`);
  }
  console.log("\nSeed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
