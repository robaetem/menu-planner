// Provenance for the generated boodschappenlijstje.
//
// The generated list is a flat set of merged lines ("600 gram gehakt"), which
// hides *why* you need that much. This module records, per line, which planned
// meals contributed how much and on which day, so the list can show:
//
//   600 gram gehakt  (i)  ->  200 gram · Opgevulde tomaten · dinsdag 28/07
//                             400 gram · Balletjes in tomatensaus · zaterdag 01/08
//
// The index is stored next to the generated document and looked up from the
// editor by line text, so it survives the user editing the quantity on a line
// (we fall back to matching the ingredient name inside the line).

import { formatProvenanceAmount, formatQuantity, type ShoppingLine } from "@/lib/planning/shopping";

/** One meal's contribution to a shopping line. */
export type ShoppingOrigin = {
  /** Recipe (or freeform meal) title. */
  meal: string;
  /** ISO day the meal is planned on (yyyy-mm-dd); "" when unknown. */
  date: string;
  /** Pre-formatted share, e.g. "200 gram". "—" when the recipe has no amount. */
  amount: string;
  /** "both" | "amber" | "robin" | null — who the meal is for. */
  assignee: string | null;
};

export type ShoppingOriginLine = {
  /** The list line exactly as generated, e.g. "600 gram gehakt". */
  label: string;
  /** Ingredient name only — the resilient matching key. */
  name: string;
  /** Pre-formatted buy-total, e.g. "600 gram". Empty when the line has no amount. */
  total: string;
  origins: ShoppingOrigin[];
};

export type ShoppingOriginIndex = {
  version: 1;
  lines: ShoppingOriginLine[];
};

export const EMPTY_ORIGIN_INDEX: ShoppingOriginIndex = { version: 1, lines: [] };

/** Collapse a list line to a comparable form: lowercase, single spaces, no
 *  surrounding punctuation or list markers. */
export function normalizeLineText(text: string): string {
  return (text || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-*•·•]\s*/, "")
    .replace(/[.,;:!?]+$/, "")
    .trim()
    .toLowerCase();
}

function isWordChar(ch: string | undefined): boolean {
  if (!ch) return false;
  return /[\p{L}\p{N}]/u.test(ch);
}

/** Does `needle` appear in `haystack` as a whole word? Both must already be
 *  normalized. Avoids "ui" matching inside "uien". */
export function containsWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return false;
    const before = at === 0 ? undefined : haystack[at - 1];
    const after = haystack[at + needle.length];
    if (!isWordChar(before) && !isWordChar(after)) return true;
    from = at + 1;
  }
}

/** Build the stored index from the aggregated shopping lines. `labelFor` must
 *  produce the exact same string that ends up in the document. */
export function buildOriginIndex(
  lines: ShoppingLine[],
  labelFor: (line: ShoppingLine) => string,
): ShoppingOriginIndex {
  const out: ShoppingOriginLine[] = [];
  for (const line of lines) {
    const origins: ShoppingOrigin[] = line.provenance.map((p) => ({
      meal: p.meal,
      date: p.date || "",
      amount: formatProvenanceAmount(p, line.unit),
      assignee: p.assignee ?? null,
    }));
    if (!origins.length) continue;
    out.push({
      label: labelFor(line),
      name: line.name,
      total: formatQuantity(line),
      origins: mergeSameMealAndDay(origins),
    });
  }
  return { version: 1, lines: out };
}

/** Add a line that did not come from a recipe (e.g. a "te kopen" vleesje). */
export function originLineFor(
  label: string,
  name: string,
  total: string,
  origins: ShoppingOrigin[],
): ShoppingOriginLine {
  return { label, name, total, origins: mergeSameMealAndDay(origins) };
}

/** The same recipe planned twice on one day would otherwise show two identical
 *  rows; keep them as separate rows only when the day or the meal differs. */
function mergeSameMealAndDay(origins: ShoppingOrigin[]): ShoppingOrigin[] {
  const seen = new Map<string, ShoppingOrigin>();
  const order: string[] = [];
  for (const o of origins) {
    const key = `${o.date}|${o.meal.toLowerCase()}|${o.assignee ?? ""}|${o.amount}`;
    if (!seen.has(key)) {
      seen.set(key, o);
      order.push(key);
    }
  }
  return order.map((k) => seen.get(k)!);
}

/** Collapse lines that render as the same text — the document only shows one
 *  line for them (see `dedupe` in the generate action), so their origins have
 *  to end up on that one line instead of the first one silently winning. */
export function mergeOriginLines(lines: ShoppingOriginLine[]): ShoppingOriginLine[] {
  const byLabel = new Map<string, ShoppingOriginLine>();
  const order: string[] = [];
  for (const line of lines) {
    const key = normalizeLineText(line.label);
    const prev = byLabel.get(key);
    if (!prev) {
      byLabel.set(key, line);
      order.push(key);
      continue;
    }
    byLabel.set(key, {
      ...prev,
      origins: mergeSameMealAndDay([...prev.origins, ...line.origins]),
    });
  }
  return order.map((k) => byLabel.get(k)!);
}

/** Sort rows chronologically so the tooltip reads like a little timeline. */
export function sortOrigins(origins: ShoppingOrigin[]): ShoppingOrigin[] {
  return [...origins].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
}

/** Look up the origins for one rendered list line.
 *
 *  1. exact match on the generated label (the normal case), then
 *  2. the longest ingredient name that appears as a whole word in the line, so
 *     a hand-edited quantity ("1 kg gehakt") keeps its tooltip.
 *
 *  Returns null when the line is not a planner line at all (a manual note, a
 *  heading, an empty item). */
export function matchOriginLine(
  text: string,
  index: ShoppingOriginIndex | null | undefined,
): ShoppingOriginLine | null {
  if (!index?.lines?.length) return null;
  const needle = normalizeLineText(text);
  if (!needle) return null;

  for (const line of index.lines) {
    if (normalizeLineText(line.label) === needle) return line;
  }

  let best: ShoppingOriginLine | null = null;
  let bestLength = 0;
  for (const line of index.lines) {
    const name = normalizeLineText(line.name);
    if (name.length <= bestLength) continue;
    if (containsWord(needle, name)) {
      best = line;
      bestLength = name.length;
    }
  }
  return best;
}

/** Narrow a value read back from jsonb into a usable index. */
export function parseOriginIndex(value: unknown): ShoppingOriginIndex | null {
  if (!value || typeof value !== "object") return null;
  const lines = (value as { lines?: unknown }).lines;
  if (!Array.isArray(lines)) return null;
  const clean: ShoppingOriginLine[] = [];
  for (const raw of lines) {
    if (!raw || typeof raw !== "object") continue;
    const l = raw as Partial<ShoppingOriginLine>;
    if (typeof l.label !== "string" || typeof l.name !== "string") continue;
    if (!Array.isArray(l.origins)) continue;
    clean.push({
      label: l.label,
      name: l.name,
      total: typeof l.total === "string" ? l.total : "",
      origins: l.origins
        .filter((o): o is ShoppingOrigin => !!o && typeof o === "object" && typeof (o as ShoppingOrigin).meal === "string")
        .map((o) => ({
          meal: o.meal,
          date: typeof o.date === "string" ? o.date : "",
          amount: typeof o.amount === "string" ? o.amount : "—",
          assignee: typeof o.assignee === "string" ? o.assignee : null,
        })),
    });
  }
  return { version: 1, lines: clean };
}
