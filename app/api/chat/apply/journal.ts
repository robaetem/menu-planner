// Undo journal for chat data changes. Before a change, every household table is
// copied; after it, the copies are compared and only the rows that changed are
// kept (before + after). Undo puts those rows back, but only when nobody edited
// them since: a row whose current state differs from `after` is a conflict and
// nothing is written.
import type { SupabaseClient } from "@supabase/supabase-js";

/** Every household data table, parents before children (FK order). */
export const JOURNAL_TABLES = [
  "household",
  "recipe_tags",
  "plan_modes",
  "ingredient_categories",
  "ingredient_category_map",
  "potjes",
  "recipes",
  "ingredients",
  "plan_days",
  "plan_meals",
  "vleesjes",
  "vleesje_names",
  "groenten",
  "groente_names",
  "potje_names",
  "freezer_portions",
  "freezer_reservations",
  "shopping_doc",
] as const;
export type JournalTable = (typeof JOURNAL_TABLES)[number];

type Row = Record<string, unknown> & { id: string };
export type Snapshot = Partial<Record<JournalTable, Row[]>>;
export type RowChange = { t: JournalTable; id: string; before: Row | null; after: Row | null };

const PAGE = 1000;

async function readTable(db: SupabaseClient, t: JournalTable): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(t).select("*").order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`Kon ${t} niet lezen: ${error.message}`);
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) return out;
  }
}

export async function snapshot(db: SupabaseClient, tables: readonly JournalTable[] = JOURNAL_TABLES): Promise<Snapshot> {
  const rows = await Promise.all(tables.map((t) => readTable(db, t)));
  return Object.fromEntries(tables.map((t, i) => [t, rows[i]]));
}

/** Key-order independent JSON, so equal rows compare equal. */
export function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}

export function diff(before: Snapshot, after: Snapshot): RowChange[] {
  const changes: RowChange[] = [];
  for (const t of JOURNAL_TABLES) {
    const b = new Map((before[t] ?? []).map((r) => [r.id, r]));
    const a = new Map((after[t] ?? []).map((r) => [r.id, r]));
    for (const id of new Set([...b.keys(), ...a.keys()])) {
      const rb = b.get(id) ?? null;
      const ra = a.get(id) ?? null;
      if (stable(rb) !== stable(ra)) changes.push({ t, id, before: rb, after: ra });
    }
  }
  return changes;
}

/** Rows that changed again since `after` (someone kept editing). */
export function conflicts(changes: RowChange[], current: Snapshot): RowChange[] {
  return changes.filter((c) => {
    const now = (current[c.t] ?? []).find((r) => r.id === c.id) ?? null;
    return stable(now) !== stable(c.after);
  });
}

/** Put every changed row back to its `before` state: re-insert removed rows
 *  (parents first), restore edited rows, then remove added rows (children first). */
export async function restore(db: SupabaseClient, changes: RowChange[]): Promise<void> {
  const order = (t: JournalTable) => JOURNAL_TABLES.indexOf(t);
  const fail = (what: string, t: string, e: { message: string } | null) => {
    if (e) throw new Error(`Terugzetten mislukt (${what} ${t}): ${e.message}`);
  };
  const reinsert = changes.filter((c) => c.before && !c.after).sort((x, y) => order(x.t) - order(y.t));
  for (const c of reinsert) {
    const { error } = await db.from(c.t).upsert(c.before!, { onConflict: "id" });
    fail("insert", c.t, error);
  }
  for (const c of changes.filter((c) => c.before && c.after)) {
    const { id: _id, ...fields } = c.before!;
    const { error } = await db.from(c.t).update(fields).eq("id", c.id);
    fail("update", c.t, error);
  }
  const added = changes.filter((c) => !c.before && c.after).sort((x, y) => order(y.t) - order(x.t));
  for (const c of added) {
    const { error } = await db.from(c.t).delete().eq("id", c.id);
    fail("delete", c.t, error);
  }
}

/** Short human summary of what changed, per table. */
export function describe(changes: RowChange[]): string {
  const label: Partial<Record<JournalTable, string>> = {
    plan_days: "dagen",
    plan_meals: "maaltijden",
    recipes: "recepten",
    ingredients: "ingrediënten",
    recipe_tags: "tags",
    plan_modes: "situaties",
    vleesjes: "vleesjes",
    groenten: "groenten",
    freezer_portions: "potjes",
    freezer_reservations: "reservaties",
    shopping_doc: "boodschappenlijst",
    ingredient_categories: "winkelsecties",
    ingredient_category_map: "ingrediënt-secties",
    household: "planning-horizon",
  };
  const n = new Map<string, number>();
  for (const c of changes) {
    const l = label[c.t];
    if (l) n.set(l, (n.get(l) ?? 0) + 1);
  }
  return [...n].map(([l, k]) => `${k} ${l}`).join(", ") || "niets";
}
