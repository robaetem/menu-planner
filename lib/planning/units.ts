// Unit spelling rules shared by the shopping list and the planning views.
// Lives in its own module so both `shopping.ts` and `ingredient-quantity.ts`
// can use it without importing each other.

/** Units bought as whole items — totals are rounded UP so we never under-buy. */
export const COUNTABLE = new Set([
  "stuk", "blik", "teen", "bos", "pak", "zak", "snee", "plak", "pot", "bol",
]);

/** Dutch plurals for units where "2 teen" would read wrong ("2 tenen"). */
const UNIT_PLURAL: Record<string, string> = {
  koffielepel: "koffielepels",
  theelepel: "theelepels",
  teen: "tenen", // "2 tenen knoflook"
};

// Reconcile unit spellings so the same ingredient merges regardless of which
// write path produced it (the editor uses "gram"/"stuk"/…, older data may use
// "g"/"stuks"/…).
const UNIT_CANON: Record<string, string> = {
  g: "gram", gr: "gram", gram: "gram", grams: "gram", grammen: "gram",
  kg: "kg", kilo: "kg", kilogram: "kg",
  l: "l", liter: "l", liters: "l",
  ml: "ml", cl: "cl", dl: "dl",
  stuk: "stuk", stuks: "stuk", st: "stuk",
  teen: "teen", tenen: "teen", teentje: "teen", teentjes: "teen",
  koffielepel: "koffielepel", koffielepels: "koffielepel", kl: "koffielepel",
  theelepel: "theelepel", theelepels: "theelepel", tl: "theelepel",
};

export function normalizeUnit(unit: string): string {
  const v = (unit || "").trim().toLowerCase();
  return UNIT_CANON[v] ?? v;
}

/** The unit as it should read next to `amount` ("1 teen" / "2 tenen"). Units we
 *  have no plural for are echoed back exactly as stored. */
export function displayUnit(unit: string, amount: number): string {
  const normalized = normalizeUnit(unit);
  if (normalized in UNIT_PLURAL) return amount === 1 ? normalized : UNIT_PLURAL[normalized];
  return unit;
}

/** The units the recipe editor offers, in dropdown order. */
export const UNIT_OPTIONS = [
  "stuk", "teen", "gram", "dl", "cl", "ml", "koffielepel", "theelepel",
];

/** Map a stored unit onto one of `UNIT_OPTIONS` for the editor dropdown. Units
 *  we have no option for (blik, rol, fles, bos, pak, …) fall back to "stuk". */
export function editorUnit(unit: string): string {
  const canonical = normalizeUnit(unit);
  return UNIT_OPTIONS.includes(canonical) ? canonical : "stuk";
}
