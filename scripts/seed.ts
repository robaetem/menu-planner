/* Seed demo data: recipes (tags + structured ingredients with units stuk/gram/
   dl/cl/ml), a freezer inventory (potjes), and a few planned days from today.
   Run: corepack pnpm dlx tsx scripts/seed.ts */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { addIsoDays, todayIso } from "../lib/date";
import type { IngredientRow } from "../lib/types";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const targetRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];

if (process.env.ALLOW_DESTRUCTIVE_SEED !== targetRef) {
  throw new Error(
    [
      "Refusing to run scripts/seed.ts because it deletes recipes, plan days, and potjes before inserting demo data.",
      "This project already has real user data.",
      `To run it anyway, set ALLOW_DESTRUCTIVE_SEED=${targetRef} for this command only.`,
    ].join("\n"),
  );
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const HOUSEHOLD = 2;
type SeedIng = { name: string; unit: string; samen?: number; amber?: number; robin?: number };
type R = { title: string; tags: string[]; ingredients: SeedIng[]; method?: string };

function toRows(ings: SeedIng[]): Omit<IngredientRow, never>[] {
  return ings.map((ig, i) => {
    const base = { name: ig.name, unit: ig.unit, is_fresh: false, include_in_shopping: true, sort: i };
    if (ig.amber != null || ig.robin != null) {
      const pp: Record<string, number> = {};
      if (ig.robin != null) pp.robin = ig.robin;
      if (ig.amber != null) pp.amber = ig.amber;
      return { ...base, scaling: "per_person", amount: null, amount_max: null, amounts_per_person: pp };
    }
    return { ...base, scaling: "per_serving", amount: ig.samen != null ? ig.samen / HOUSEHOLD : null, amount_max: null, amounts_per_person: {} };
  });
}

const RECIPES: R[] = [
  { title: "Wortelpuree met hamburgers", tags: ["verse groenten"], ingredients: [
    { name: "hamburger", unit: "stuk", amber: 1, robin: 2 },
    { name: "wortels", unit: "gram", samen: 350 },
    { name: "aardappelen", unit: "gram", samen: 300 },
  ] },
  { title: "Balletjes in tomatensaus", tags: ["diepvriesvriendelijk", "winter"], ingredients: [
    { name: "gehakt", unit: "gram", samen: 500 },
    { name: "bonen in tomatensaus", unit: "stuk", samen: 2 },
    { name: "tomatenstukjes", unit: "stuk", samen: 1 },
    { name: "aardappelen", unit: "gram", samen: 300 },
  ] },
  { title: "Wraps met ratatouille en ei", tags: ["snel", "verse groenten", "zomer"], ingredients: [
    { name: "wraps", unit: "stuk", amber: 2, robin: 3 },
    { name: "courgette", unit: "stuk", samen: 1 },
    { name: "aubergine", unit: "stuk", samen: 1 },
    { name: "paprika", unit: "stuk", samen: 2 },
    { name: "ei", unit: "stuk", amber: 1, robin: 2 },
    { name: "passata", unit: "stuk", samen: 1 },
  ] },
  { title: "Quiche lorraine met bloemkool", tags: ["diepvriesvriendelijk", "winter"], ingredients: [
    { name: "spekblokjes", unit: "gram", samen: 150 },
    { name: "eieren", unit: "stuk", samen: 4 },
    { name: "room", unit: "ml", samen: 200 },
    { name: "bloemkool", unit: "stuk", samen: 1 },
    { name: "geraspte kaas", unit: "gram", samen: 100 },
    { name: "bladerdeeg", unit: "stuk", samen: 1 },
  ] },
  { title: "Spaghetti bolognese", tags: ["pasta", "diepvriesvriendelijk"], ingredients: [
    { name: "spaghetti", unit: "gram", samen: 250 },
    { name: "gehakt", unit: "gram", samen: 500 },
    { name: "tomatenstukjes", unit: "stuk", samen: 1 },
    { name: "ui", unit: "stuk", samen: 1 },
    { name: "knoflook", unit: "stuk", samen: 2 },
  ] },
  { title: "Kip curry met rijst", tags: ["snel"], ingredients: [
    { name: "kipfilet", unit: "stuk", amber: 1, robin: 2 },
    { name: "rijst", unit: "gram", samen: 250 },
    { name: "kokosmelk", unit: "stuk", samen: 1 },
    { name: "currypasta", unit: "gram", samen: 40 },
    { name: "paprika", unit: "stuk", samen: 2 },
  ] },
  { title: "Tomatensoep met balletjes", tags: ["snel", "verse groenten", "diepvriesvriendelijk"], ingredients: [
    { name: "tomaten", unit: "gram", samen: 1000 },
    { name: "ui", unit: "stuk", samen: 1 },
    { name: "tomatenstukjes", unit: "stuk", samen: 1 },
    { name: "gehakt", unit: "gram", samen: 200 },
    { name: "bouillon", unit: "ml", samen: 500 },
  ] },
  { title: "Stoofvlees met frietjes", tags: ["winter", "diepvriesvriendelijk"], ingredients: [
    { name: "stoofvlees", unit: "gram", samen: 800 },
    { name: "ui", unit: "stuk", samen: 2 },
    { name: "bruin bier", unit: "stuk", samen: 1 },
    { name: "frietjes", unit: "gram", samen: 1000 },
  ] },
];

const POTJES = [
  { name: "Opgevulde tomaten", robin: 2, amber: 4 },
  { name: "Gehaktballetjes in tomatensaus", robin: 3, amber: 3 },
  { name: "Stoofvlees", robin: 1, amber: 1 },
];

type Assignee = "both" | "amber" | "robin";
function dinersFor(a: Assignee) {
  if (a === "amber") return { keys: ["amber"], count: 1 };
  if (a === "robin") return { keys: ["robin"], count: 1 };
  return { keys: ["robin", "amber"], count: 2 };
}

type MealSpec = { assignee: Assignee; recipe?: string; potje?: string; potjes?: number };
type DaySpec = { offset: number; amber_mode?: string; robin_mode?: string; meals: MealSpec[] };

const PLAN: DaySpec[] = [
  { offset: 0, amber_mode: "Vrije middag", robin_mode: "Leuven", meals: [{ assignee: "both", recipe: "Wraps met ratatouille en ei" }] },
  { offset: 1, meals: [{ assignee: "amber", potje: "Opgevulde tomaten" }, { assignee: "robin", potje: "Gehaktballetjes in tomatensaus" }] },
  { offset: 2, amber_mode: "24 uur", meals: [{ assignee: "amber", potje: "Opgevulde tomaten" }, { assignee: "robin", recipe: "Wortelpuree met hamburgers", potjes: 2 }] },
  { offset: 3, meals: [{ assignee: "both", recipe: "Balletjes in tomatensaus", potjes: 2 }] },
];

async function main() {
  console.log("Clearing recipes + plan_days + potjes…");
  await db.from("plan_days").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await db.from("potjes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await db.from("recipes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await db.from("household").update({ plan_horizon: null }).neq("id", "00000000-0000-0000-0000-000000000000");

  const recipeId: Record<string, string> = {};
  for (const r of RECIPES) {
    const { data: rec, error } = await db
      .from("recipes")
      .insert({
        title: r.title,
        tags: r.tags,
        prep_minutes: null,
        base_servings: 2,
        uses_fresh_veg: r.tags.includes("verse groenten"),
        freezer_friendly: r.tags.includes("diepvriesvriendelijk"),
        method: r.method ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    recipeId[r.title] = rec.id;
    const rows = toRows(r.ingredients).map((x) => ({ ...x, recipe_id: rec.id }));
    if (rows.length) {
      const { error: e2 } = await db.from("ingredients").insert(rows);
      if (e2) throw e2;
    }
    console.log(`  recipe + ${r.title}`);
  }

  const potje: Record<string, { id: string; robin: number; amber: number }> = {};
  for (const p of POTJES) {
    const { data, error } = await db.from("potjes").insert({ name: p.name, robin_count: p.robin, amber_count: p.amber }).select("id").single();
    if (error) throw error;
    potje[p.name] = { id: data.id, robin: p.robin, amber: p.amber };
    console.log(`  potje + ${p.name}`);
  }

  const today = todayIso();
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
      const isPotje = !!m.potje;
      const pj = isPotje ? potje[m.potje!] : null;
      if (isPotje && pj) {
        if (dn.keys.includes("robin")) pj.robin -= 1;
        if (dn.keys.includes("amber")) pj.amber -= 1;
      }
      const { error: me } = await db.from("plan_meals").insert({
        plan_day_id: d.id,
        assignee: m.assignee,
        from_freezer: isPotje,
        recipe_id: m.recipe ? recipeId[m.recipe] : null,
        potje_id: pj?.id ?? null,
        freeform_title: isPotje ? m.potje : m.recipe ?? "Gerecht",
        raw_text: isPotje ? m.potje! : m.recipe ?? "",
        diner_keys: dn.keys,
        diner_count: dn.count,
        // "+N potjes" -> split per person (odd count -> extra on Robin), matching
        // the per-person freezer model (migration 0011).
        freezer_robin: Math.ceil((m.potjes ?? 0) / 2),
        freezer_amber: Math.floor((m.potjes ?? 0) / 2),
        sort: sort++,
      });
      if (me) throw me;
    }
    console.log(`  day + ${date}`);
  }

  for (const p of POTJES) {
    const pj = potje[p.name];
    await db.from("potjes").update({ robin_count: Math.max(0, pj.robin), amber_count: Math.max(0, pj.amber) }).eq("id", pj.id);
  }

  console.log("\nSeed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
