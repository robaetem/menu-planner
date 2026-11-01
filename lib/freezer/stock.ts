// Counted freezer stock (vleesjes, groenten) with reservations by planned meals.
//
// One model for both inventories:
//
//   * An entry is one batch in the freezer (name, unit, amount, frozen on).
//     Several entries may share a name.
//   * A meal says what it wants (lines: name + unit + amount) and holds
//     reservations against specific entries. A meal takes from the entry that
//     has been in the freezer longest; equally old entries are picked at
//     random. Wanted minus reserved is a shortage, shown, never hidden.
//   * Reserved stock stays in the freezer until the meal's day has passed
//     (settled server-side by `settle_freezer_reservations`).
//
// Pure functions only: the server actions turn the returned changes into
// writes, the UI uses the same functions to show availability and status.

export type StockEntry = {
  id: string;
  name: string;
  /** "" for vleesjes (pieces). */
  unit: string;
  /** Physically in the freezer now (reserved pieces included). */
  amount: number;
  createdAt: string;
};

/** An open (unsettled) reservation of `amount` from one entry by one meal. */
export type StockReservation = {
  id: string;
  entryId: string;
  mealId: string;
  amount: number;
  /** The meal's day (yyyy-mm-dd). */
  day: string;
  mealTitle: string;
};

/** What a meal wants from the freezer, per name. */
export type StockLine = { name: string; unit: string; amount: number };

export type MealDemand = { mealId: string; day: string; sort: number; lines: StockLine[] };

/** One inventory as the planner and freezer tab see it. */
export type FreezerStock = {
  entries: StockEntry[];
  reservations: StockReservation[];
  /** Upcoming meals (today and later) and what they want from this stock. */
  demands: MealDemand[];
};

export const EMPTY_STOCK: FreezerStock = { entries: [], reservations: [], demands: [] };

export type StockChange = {
  insert: { entryId: string; mealId: string; amount: number }[];
  update: { id: string; amount: number }[];
  remove: string[];
};

export type Random = () => number;

/** Identity of a stock line: exact trimmed name, case-insensitive (never a
 *  LIKE pattern), plus the unit. */
export function stockKey(name: string, unit = ""): string {
  return `${(name || "").trim().toLowerCase()}|${(unit || "").trim().toLowerCase()}`;
}

const EPS = 1e-9;
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function emptyChange(): StockChange {
  return { insert: [], update: [], remove: [] };
}

export function reservedOf(entryId: string, reservations: StockReservation[]): number {
  return round3(reservations.filter((r) => r.entryId === entryId).reduce((s, r) => s + r.amount, 0));
}

export function freeOf(entry: StockEntry, reservations: StockReservation[]): number {
  return Math.max(0, round3(entry.amount - reservedOf(entry.id, reservations)));
}

/** Oldest first; entries frozen at the same moment in random order. */
export function oldestFirst(entries: StockEntry[], random: Random = Math.random): StockEntry[] {
  return entries
    .map((e) => ({ e, r: random() }))
    .sort((a, b) => (a.e.createdAt < b.e.createdAt ? -1 : a.e.createdAt > b.e.createdAt ? 1 : a.r - b.r))
    .map((x) => x.e);
}

/** Total of a meal's lines per key, keeping the first-seen name/unit. */
export function lineTotals(lines: StockLine[]): Map<string, StockLine> {
  const m = new Map<string, StockLine>();
  for (const l of lines || []) {
    const name = (l.name || "").trim();
    const amount = Number(l.amount) || 0;
    if (!name || amount <= 0) continue;
    const k = stockKey(name, l.unit);
    const prev = m.get(k);
    m.set(k, { name: prev?.name ?? name, unit: prev?.unit ?? (l.unit || ""), amount: round3((prev?.amount ?? 0) + amount) });
  }
  return m;
}

/** Take `amount` of `key` from the free stock, oldest entry first. */
export function pickFromStock(
  entries: StockEntry[],
  reservations: StockReservation[],
  key: string,
  amount: number,
  random: Random = Math.random,
): { picks: { entryId: string; amount: number }[]; short: number } {
  let left = round3(amount);
  const picks: { entryId: string; amount: number }[] = [];
  for (const e of oldestFirst(entries.filter((x) => stockKey(x.name, x.unit) === key), random)) {
    if (left <= EPS) break;
    const take = Math.min(freeOf(e, reservations), left);
    if (take <= EPS) continue;
    picks.push({ entryId: e.id, amount: round3(take) });
    left = round3(left - take);
  }
  return { picks, short: Math.max(0, left) };
}

/** Free stock per key. `forMealId`'s own reservations count as free: editing
 *  that meal gives them back first. */
export function availableByKey(
  entries: StockEntry[],
  reservations: StockReservation[],
  forMealId?: string | null,
): Map<string, { name: string; unit: string; free: number; total: number }> {
  const others = forMealId ? reservations.filter((r) => r.mealId !== forMealId) : reservations;
  const m = new Map<string, { name: string; unit: string; free: number; total: number }>();
  for (const e of oldestFirst(entries, () => 0)) {
    const k = stockKey(e.name, e.unit);
    const prev = m.get(k);
    m.set(k, {
      name: prev?.name ?? e.name.trim(),
      unit: e.unit,
      free: round3((prev?.free ?? 0) + freeOf(e, others)),
      total: round3((prev?.total ?? 0) + e.amount),
    });
  }
  return m;
}

/** Bookkeeping helper: apply a change to a reservation list in memory. */
function applyLocal(res: StockReservation[], change: StockChange, meta: (mealId: string) => { day: string; mealTitle: string }) {
  let out = res.filter((r) => !change.remove.includes(r.id));
  out = out.map((r) => {
    const u = change.update.find((x) => x.id === r.id);
    return u ? { ...r, amount: u.amount } : r;
  });
  change.insert.forEach((ins, i) => out.push({ id: `new-${i}`, ...ins, ...meta(ins.mealId) }));
  return out;
}

/** Give back `amount` of a meal's reservations, from the newest entry first
 *  (so the oldest stays with the meal). */
function release(
  mine: StockReservation[],
  entries: StockEntry[],
  amount: number,
  change: StockChange,
): void {
  const createdAt = new Map(entries.map((e) => [e.id, e.createdAt]));
  let left = round3(amount);
  const newestFirst = [...mine].sort((a, b) =>
    (createdAt.get(a.entryId) ?? "") < (createdAt.get(b.entryId) ?? "") ? 1 : -1,
  );
  for (const r of newestFirst) {
    if (left <= EPS) break;
    if (r.amount <= left + EPS) {
      change.remove.push(r.id);
      left = round3(left - r.amount);
    } else {
      change.update.push({ id: r.id, amount: round3(r.amount - left) });
      left = 0;
    }
  }
}

export class StockShortError extends Error {}

/** Reconcile one meal's reservations with its new lines. Unchanged lines keep
 *  their entries; lowered lines give back newest-first; raised lines take
 *  oldest-first. With `strict`, raising a line beyond the free stock throws
 *  (a line that was already short and is not raised stays short). */
export function planMealReservations(
  entries: StockEntry[],
  reservations: StockReservation[],
  mealId: string,
  before: StockLine[],
  after: StockLine[],
  opts: { strict?: boolean; random?: Random } = {},
): StockChange {
  const change = emptyChange();
  const prev = lineTotals(before);
  const next = lineTotals(after);
  const keys = new Set([...prev.keys(), ...next.keys(), ...reservations.filter((r) => r.mealId === mealId).map((r) => keyOfEntry(entries, r.entryId))]);
  let working = reservations;
  for (const key of keys) {
    if (!key) continue;
    const mine = working.filter((r) => r.mealId === mealId && keyOfEntry(entries, r.entryId) === key);
    const held = round3(mine.reduce((s, r) => s + r.amount, 0));
    const want = next.get(key)?.amount ?? 0;
    if (held > want + EPS) {
      const step = emptyChange();
      release(mine, entries, held - want, step);
      merge(change, step);
      working = applyLocal(working, step, () => ({ day: "", mealTitle: "" }));
    } else if (want > held + EPS) {
      const { picks, short } = pickFromStock(entries, working, key, want - held, opts.random);
      if (short > EPS && opts.strict && want > (prev.get(key)?.amount ?? 0) + EPS) {
        const line = next.get(key)!;
        const free = round3(want - short);
        throw new StockShortError(
          free > 0
            ? `Er is nog maar ${fmt(free)} ${line.name} vrij in de diepvries.`
            : `Er is geen ${line.name} meer vrij in de diepvries.`,
        );
      }
      const step: StockChange = { insert: picks.map((p) => ({ ...p, mealId })), update: [], remove: [] };
      merge(change, step);
      working = applyLocal(working, step, () => ({ day: "", mealTitle: "" }));
    }
  }
  return change;
}

/** Fill shortages of upcoming meals from free stock, earliest day first. Run
 *  after anything frees stock (meal deleted, line lowered, stock added). */
export function planFillShortages(
  entries: StockEntry[],
  reservations: StockReservation[],
  demands: MealDemand[],
  random: Random = Math.random,
): StockChange {
  const change = emptyChange();
  let working = reservations;
  const ordered = [...demands].sort((a, b) => a.day.localeCompare(b.day) || a.sort - b.sort || a.mealId.localeCompare(b.mealId));
  for (const d of ordered) {
    for (const [key, line] of lineTotals(d.lines)) {
      const held = working
        .filter((r) => r.mealId === d.mealId && keyOfEntry(entries, r.entryId) === key)
        .reduce((s, r) => s + r.amount, 0);
      if (line.amount <= held + EPS) continue;
      const { picks } = pickFromStock(entries, working, key, line.amount - held, random);
      if (!picks.length) continue;
      const step: StockChange = { insert: picks.map((p) => ({ ...p, mealId: d.mealId })), update: [], remove: [] };
      merge(change, step);
      working = applyLocal(working, step, () => ({ day: d.day, mealTitle: "" }));
    }
  }
  return change;
}

/** When an entry holds less than is reserved from it (counted down by hand,
 *  or deleted), the latest meals give their reservation back first. */
export function planTrimOverbooked(entries: StockEntry[], reservations: StockReservation[]): StockChange {
  const change = emptyChange();
  for (const e of entries) {
    let over = round3(reservedOf(e.id, reservations) - e.amount);
    if (over <= EPS) continue;
    const latestFirst = reservations
      .filter((r) => r.entryId === e.id)
      .sort((a, b) => b.day.localeCompare(a.day) || b.id.localeCompare(a.id));
    for (const r of latestFirst) {
      if (over <= EPS) break;
      if (r.amount <= over + EPS) {
        change.remove.push(r.id);
        over = round3(over - r.amount);
      } else {
        change.update.push({ id: r.id, amount: round3(r.amount - over) });
        over = 0;
      }
    }
  }
  return change;
}

export type MealShortage = { name: string; unit: string; wanted: number; reserved: number; short: number };

/** Per line of one meal: how much is reserved and how much is missing. */
export function mealStockStatus(
  entries: StockEntry[],
  reservations: StockReservation[],
  mealId: string,
  lines: StockLine[],
): MealShortage[] {
  return [...lineTotals(lines)].map(([key, line]) => {
    const reserved = round3(
      reservations
        .filter((r) => r.mealId === mealId && keyOfEntry(entries, r.entryId) === key)
        .reduce((s, r) => s + r.amount, 0),
    );
    return { name: line.name, unit: line.unit, wanted: line.amount, reserved, short: Math.max(0, round3(line.amount - reserved)) };
  });
}

export type EntryStatus = {
  free: number;
  planned: { day: string; amount: number; mealTitle: string; mealId: string }[];
};

/** What the freezer tab shows per entry: how much is free and which days take
 *  the rest. */
export function entryStatus(entry: StockEntry, reservations: StockReservation[]): EntryStatus {
  const mine = reservations.filter((r) => r.entryId === entry.id);
  const byMeal = new Map<string, { day: string; amount: number; mealTitle: string; mealId: string }>();
  for (const r of mine) {
    const p = byMeal.get(r.mealId) ?? { day: r.day, amount: 0, mealTitle: r.mealTitle, mealId: r.mealId };
    p.amount = round3(p.amount + r.amount);
    byMeal.set(r.mealId, p);
  }
  return {
    free: freeOf(entry, reservations),
    planned: [...byMeal.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}

/** Shortages across all upcoming meals, per name (for the freezer tab). */
export function shortagesByKey(
  entries: StockEntry[],
  reservations: StockReservation[],
  demands: MealDemand[],
): Map<string, { name: string; unit: string; short: number; days: { day: string; short: number; mealId: string }[] }> {
  const m = new Map<string, { name: string; unit: string; short: number; days: { day: string; short: number; mealId: string }[] }>();
  for (const d of demands) {
    for (const s of mealStockStatus(entries, reservations, d.mealId, d.lines)) {
      if (s.short <= EPS) continue;
      const k = stockKey(s.name, s.unit);
      const prev = m.get(k) ?? { name: s.name, unit: s.unit, short: 0, days: [] };
      prev.short = round3(prev.short + s.short);
      prev.days.push({ day: d.day, short: s.short, mealId: d.mealId });
      m.set(k, prev);
    }
  }
  for (const v of m.values()) v.days.sort((a, b) => a.day.localeCompare(b.day));
  return m;
}

function keyOfEntry(entries: StockEntry[], entryId: string): string {
  const e = entries.find((x) => x.id === entryId);
  return e ? stockKey(e.name, e.unit) : "";
}

function merge(into: StockChange, step: StockChange) {
  into.insert.push(...step.insert);
  into.update.push(...step.update);
  into.remove.push(...step.remove);
}

function fmt(n: number): string {
  return new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 3 }).format(n);
}

/** The recipe ingredient a freezer vegetable most likely stands in for:
 *  "Witte kool 2P" -> "Witte kool". Ignores portion/weight suffixes such as
 *  "2P", "1p" or "500g". Null when nothing matches. */
export function guessReplacedIngredient(groenteName: string, ingredientNames: string[]): string | null {
  const norm = (s: string) =>
    ` ${(s || "")
      .toLowerCase()
      .replace(/\b\d+([.,]\d+)?\s*(p|g|gr|gram|kg|st)\b/g, " ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()} `;
  const g = norm(groenteName);
  if (!g.trim()) return null;
  let best: { name: string; len: number } | null = null;
  for (const name of ingredientNames) {
    const i = norm(name);
    if (!i.trim()) continue;
    if (g.includes(i) || i.includes(g)) {
      const len = i.trim().length;
      if (!best || len > best.len) best = { name, len };
    }
  }
  return best?.name ?? null;
}

/** The freezer lines a planned meal wants from one inventory. */
export function mealStockLines(
  kind: "vleesje" | "groente",
  meal: { template_vleesjes?: unknown; template_groenten?: unknown },
): StockLine[] {
  if (kind === "vleesje") {
    return ((meal.template_vleesjes || []) as { name: string; count: number; source: string }[])
      .filter((v) => v.source === "freezer")
      .map((v) => ({ name: v.name, unit: "", amount: Number(v.count) || 0 }));
  }
  return ((meal.template_groenten || []) as { name: string; unit?: string; amount: number }[]).map((g) => ({
    name: g.name,
    unit: g.unit || "",
    amount: Number(g.amount) || 0,
  }));
}
