import type { RecipeWithIngredients } from "@/lib/types";

// Local (no-LLM) freeform suggestion ranker. Tokenize the query, expand a small
// Dutch/English synonym map into "concepts", then score each recipe by weighted
// overlap against tags / title / ingredient names / notes, plus semantic bonuses
// (snel<=25min, fresh veg, freezer-friendly). A leading number ("10 recepten met
// verse groenten") is read as a result limit.

function fold(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const SYNONYMS: Record<string, string[]> = {
  snel: ["snel"], vlug: ["snel"], rap: ["snel"], fast: ["snel"], quick: ["snel"],
  makkelijk: ["snel"], simpel: ["snel"], easy: ["snel"], weinig: ["snel"],
  warm: ["warm", "snel"], heet: ["warm", "snel"], hot: ["warm", "snel"],
  zomer: ["warm", "vers"], summer: ["warm", "vers"], hittegolf: ["warm", "snel"],
  vers: ["vers"], verse: ["vers"], fresh: ["vers"],
  groente: ["vers", "groente"], groenten: ["vers", "groente"], vegetables: ["vers", "groente"],
  veggie: ["veggie"], vega: ["veggie"], vegetarisch: ["veggie"], vegetarian: ["veggie"], vegan: ["veggie"],
  vriezer: ["vriezer"], diepvries: ["vriezer"], freezer: ["vriezer"], invriezen: ["vriezer"], potjes: ["vriezer"], voorraad: ["vriezer"],
  oven: ["oven"], traag: ["traag"], slow: ["traag"], stoof: ["traag"], comfort: ["traag"],
  pasta: ["pasta"], rijst: ["rijst"], soep: ["soep"], salade: ["vers", "salade"], sla: ["vers", "salade"],
  kip: ["kip"], vis: ["vis"], vlees: ["vlees"], aardappel: ["aardappel"], aardappelen: ["aardappel"],
};

export type RankOptions = { dayIndex?: number; totalDays?: number; limit?: number };

// Common Dutch/English filler words that shouldn't match recipe titles/ingredients.
const STOPWORDS = new Set([
  "iets", "met", "een", "voor", "wil", "willen", "wat", "het", "dat", "die", "zijn",
  "naar", "ook", "nog", "dan", "the", "and", "with", "for", "want", "something",
  "recept", "recepten", "recipe", "recipes", "eten", "maken", "graag", "vandaag",
  "deze", "week", "weer", "heb", "hebben", "kunnen", "moet", "even", "wel",
]);

export function expandQuery(q: string): { concepts: string[]; limit: number | null } {
  const raw = fold(q).split(/[^a-z0-9]+/).filter(Boolean);
  let limit: number | null = null;
  const concepts: string[] = [];
  for (const t of raw) {
    if (/^\d+$/.test(t)) {
      const n = parseInt(t, 10);
      if (n > 0 && n <= 100) limit = n;
      continue;
    }
    if (SYNONYMS[t]) concepts.push(...SYNONYMS[t]);
    else if (t.length >= 3 && !STOPWORDS.has(t)) concepts.push(t);
  }
  return { concepts: [...new Set(concepts)], limit };
}

export function scoreRecipe(r: RecipeWithIngredients, concepts: string[], opts: RankOptions): number {
  if (concepts.length === 0) return 0;
  const tagsF = (r.tags || []).map(fold);
  const titleF = fold(r.title);
  const ingF = (r.ingredients || []).map((i) => fold(i.name));
  const notesF = fold(r.notes || "");
  let score = 0;
  for (const c of concepts) {
    if (tagsF.includes(c)) score += 3;
    if (titleF.includes(c)) score += 2;
    if (ingF.some((n) => n.includes(c))) score += 2;
    if (notesF.includes(c)) score += 1;
    if (c === "snel" && r.prep_minutes != null && r.prep_minutes <= 25) score += 3;
    if (c === "vers" && r.uses_fresh_veg) score += 3;
    if (c === "vriezer" && r.freezer_friendly) score += 3;
    if (c === "veggie" && (tagsF.includes("vegetarisch") || tagsF.includes("veggie") || tagsF.includes("vega"))) score += 2;
  }
  if (opts.dayIndex != null) {
    const early = opts.dayIndex <= 1;
    if (early && r.uses_fresh_veg) score += 1.5;
    if (!early && r.freezer_friendly) score += 1.5;
  }
  return score;
}

export function rankRecipes(
  recipes: RecipeWithIngredients[],
  query: string,
  opts: RankOptions = {},
): RecipeWithIngredients[] {
  const { concepts, limit } = expandQuery(query);
  if (concepts.length === 0) {
    const sorted = [...recipes].sort((a, b) => a.title.localeCompare(b.title, "nl"));
    return opts.limit ? sorted.slice(0, opts.limit) : sorted;
  }
  const scored = recipes
    .map((r) => ({ r, s: scoreRecipe(r, concepts, opts) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.r.cook_count - b.r.cook_count || a.r.title.localeCompare(b.r.title, "nl"));
  const out = scored.map((x) => x.r);
  const lim = limit ?? opts.limit ?? null;
  return lim ? out.slice(0, lim) : out;
}

export function hasQuery(q: string): boolean {
  return expandQuery(q).concepts.length > 0;
}
