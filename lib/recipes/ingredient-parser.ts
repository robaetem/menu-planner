import type { Ingredient, ScalingMode } from "@/lib/types";

// Freeform ingredient lines, one ingredient per line. Plain lines need no
// syntax; a few light keywords cover the rarer cases:
//   "700 g wortels"                         -> per_serving, 700 g wortels
//   "800-1000 g gehakt"                     -> per_serving range (buy upper bound)
//   "Robin 2 / Amber 1 stuk hamburger"      -> per_person (Robin 2, Amber 1)
//   "vast: 1 blik tomatenstukjes"           -> fixed (once per meal)
//   "2 stuk paprika *"                      -> fresh produce (trailing * or "(vers)")
// Amounts are entered "for {base_servings} people"; per_serving amounts are
// normalized to one serving on save (divide by base_servings) so the shopping
// list never divides at read time.

export type ParsedIngredient = {
  name: string;
  unit: string;
  scaling: ScalingMode;
  /** Raw amount as typed (for base_servings people); normalized on save. */
  amount: number | null;
  amount_max: number | null;
  amounts_per_person: Record<string, number>;
  is_fresh: boolean;
};

export type IngredientRow = Omit<Ingredient, "id" | "recipe_id">;

const UNIT_ALIASES: Record<string, string> = {
  g: "g", gr: "g", gram: "g", grams: "g", grammen: "g",
  kg: "kg", kilo: "kg", kilogram: "kg",
  ml: "ml", cl: "cl", dl: "dl", l: "l", liter: "l", liters: "l",
  blik: "blik", blikken: "blik", blikje: "blik", blikjes: "blik",
  stuk: "stuk", stuks: "stuk", st: "stuk",
  el: "el", eetlepel: "el", eetlepels: "el",
  tl: "tl", theelepel: "tl", theelepels: "tl",
  teen: "teen", tenen: "teen", teentje: "teen", teentjes: "teen",
  bol: "bol", bos: "bos", bosje: "bos", bussel: "bos",
  pot: "pot", potje: "pot", potjes: "pot",
  pak: "pak", pakje: "pak", zak: "zak", zakje: "zak",
  snee: "snee", sneetje: "snee", sneetjes: "snee",
  plak: "plak", plakken: "plak", plakje: "plak",
};
const KNOWN_UNITS = new Set(Object.keys(UNIT_ALIASES));

function num(s: string | undefined | null): number | null {
  if (s == null) return null;
  const v = parseFloat(String(s).replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

function splitUnitName(s: string): { unit: string; name: string } {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { unit: "", name: "" };
  const first = parts[0].toLowerCase().replace(/\.$/, "");
  if (KNOWN_UNITS.has(first) && parts.length > 1) {
    return { unit: UNIT_ALIASES[first], name: parts.slice(1).join(" ") };
  }
  return { unit: "", name: parts.join(" ") };
}

export function parseIngredientLine(
  raw: string,
  dinerKeys: string[] = ["robin", "amber"],
): ParsedIngredient | null {
  let line = raw.trim().replace(/^[-*•·]\s+/, "").trim();
  if (!line) return null;

  // fresh markers
  let is_fresh = false;
  if (/\(vers\)/i.test(line)) {
    is_fresh = true;
    line = line.replace(/\(vers\)/i, " ");
  }
  if (/\*\s*$/.test(line)) {
    is_fresh = true;
    line = line.replace(/\*\s*$/, " ");
  }
  line = line.trim();

  // fixed markers: "vast:", "#vast", or "(vast)"
  let scaling: ScalingMode = "per_serving";
  if (/^\s*#?vast\b[:]?/i.test(line) || /\(vast\)/i.test(line)) {
    scaling = "fixed";
    line = line.replace(/^\s*#?vast\b[:]?\s*/i, "").replace(/\(vast\)/i, " ").trim();
  }

  // per-person: "Robin 2", "@amber 1", etc.
  const keyAlt = dinerKeys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const ppRegex = new RegExp(`@?\\b(${keyAlt})\\b\\s*[:]?\\s*(\\d+(?:[.,]\\d+)?)`, "gi");
  const pp: Record<string, number> = {};
  let hadPP = false;
  const cleaned = line.replace(ppRegex, (_full, who: string, amt: string) => {
    hadPP = true;
    pp[who.toLowerCase()] = num(amt) ?? 0;
    return " ";
  });
  if (hadPP) {
    const rest = cleaned.replace(/\s*[/,]\s*/g, " ").replace(/\s+/g, " ").trim();
    const { unit, name } = splitUnitName(rest);
    return { name, unit, scaling: "per_person", amount: null, amount_max: null, amounts_per_person: pp, is_fresh };
  }

  // leading amount or range
  let amount: number | null = null;
  let amount_max: number | null = null;
  let rest = line;
  const rangeM = line.match(/^(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*(.*)$/);
  const singleM = line.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (rangeM) {
    amount = num(rangeM[1]);
    amount_max = num(rangeM[2]);
    rest = rangeM[3];
  } else if (singleM) {
    amount = num(singleM[1]);
    rest = singleM[2];
  }
  const { unit, name } = splitUnitName(rest);
  return { name: name.trim(), unit, scaling, amount, amount_max, amounts_per_person: {}, is_fresh };
}

export function parseIngredientsText(
  text: string,
  dinerKeys: string[] = ["robin", "amber"],
): ParsedIngredient[] {
  return text
    .split(/\r?\n/)
    .map((l) => parseIngredientLine(l, dinerKeys))
    .filter((x): x is ParsedIngredient => x != null && x.name.length > 0);
}

/** Convert parsed lines into DB rows, normalizing per_serving by base_servings. */
export function toIngredientRows(parsed: ParsedIngredient[], baseServings: number): IngredientRow[] {
  const b = baseServings > 0 ? baseServings : 1;
  return parsed.map((p, i) => ({
    name: p.name.trim(),
    unit: p.unit.trim(),
    scaling: p.scaling,
    amount: p.scaling === "per_serving" && p.amount != null ? p.amount / b : p.amount,
    amount_max: p.scaling === "per_serving" && p.amount_max != null ? p.amount_max / b : p.amount_max,
    amounts_per_person: p.amounts_per_person,
    is_fresh: p.is_fresh,
    include_in_shopping: true,
    sort: i,
  }));
}

function fmtNum(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : String(r).replace(".", ",");
}
function cap(k: string): string {
  return k.charAt(0).toUpperCase() + k.slice(1);
}

/** Serialize one stored ingredient back to an editable line (denormalizing per_serving). */
export function serializeIngredient(ig: Ingredient, baseServings: number): string {
  const b = baseServings > 0 ? baseServings : 1;
  let s = "";
  if (ig.scaling === "per_person") {
    const parts = Object.entries(ig.amounts_per_person || {}).map(([k, v]) => `${cap(k)} ${fmtNum(Number(v))}`);
    s = parts.join(" / ");
    if (ig.unit) s += ` ${ig.unit}`;
    s += ` ${ig.name}`;
  } else {
    const denom = ig.scaling === "per_serving" ? b : 1;
    if (ig.amount != null) {
      s += fmtNum(ig.amount * denom);
      if (ig.amount_max != null) s += `-${fmtNum(ig.amount_max * denom)}`;
      if (ig.unit) s += ` ${ig.unit}`;
      s += ` ${ig.name}`;
    } else {
      s = ig.name;
    }
    if (ig.scaling === "fixed") s = `vast: ${s}`;
  }
  if (ig.is_fresh) s += " *";
  return s.trim();
}

export function ingredientsToText(ings: Ingredient[], baseServings: number): string {
  return [...ings]
    .sort((a, b) => a.sort - b.sort)
    .map((ig) => serializeIngredient(ig, baseServings))
    .join("\n");
}
