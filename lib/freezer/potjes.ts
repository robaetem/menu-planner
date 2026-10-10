// Potjes: frozen portions, each with a timeline.
//
// Nothing here is a stored counter:
//
//   * A portion cooked by a planned meal goes in on the cook day and is
//     eatable from the day after. A portion entered by hand is already in.
//   * A portion reserved by a "Potje diepvries" meal is eaten that evening.
//
// Pure functions only — shared by the server actions (which validate) and the
// planning UI.

import { addIsoDays } from "@/lib/date";

export type Who = "robin" | "amber";

/** A frozen portion as the planner sees it (the DB row plus its meals' dates). */
export type Portion = {
  id: string;
  who: Who;
  name: string;
  /** The planned meal that cooks it, and that meal's day. */
  sourceMealId: string | null;
  cookOn: string | null;
  /** Manual portions: the day it went in (null = long ago). */
  frozenOn: string | null;
  /** The "Potje diepvries" meal that eats it, and that meal's day. */
  eatenByMealId: string | null;
  eatenOn: string | null;
};

/** First day the portion can be eaten: the day after it is cooked. */
export function readyOn(p: Portion): string | null {
  return p.sourceMealId && p.cookOn ? addIsoDays(p.cookOn, 1) : null;
}

/** Eaten before `today` — gone from the freezer. */
export function isConsumed(p: Portion, today: string): boolean {
  return !!p.eatenOn && p.eatenOn < today;
}

/** Physically in the freezer on `today` (cooked before today, or entered by hand). */
export function isInFreezer(p: Portion, today: string): boolean {
  if (isConsumed(p, today)) return false;
  return !p.sourceMealId || (!!p.cookOn && p.cookOn < today);
}

/** Portions `who` could still pick for a meal on `date`: unreserved, not eaten,
 *  and cooked before that day. Oldest first, so the freezer rotates. */
export function availablePortions(portions: Portion[], date: string, who: Who, today: string): Portion[] {
  return portions
    .filter((p) => p.who === who && !p.eatenByMealId && !isConsumed(p, today))
    .filter((p) => {
      const ready = readyOn(p);
      return !ready || ready <= date;
    })
    .sort(byAge);
}

function byAge(a: Portion, b: Portion): number {
  const ka = readyOn(a) ?? a.frozenOn ?? "";
  const kb = readyOn(b) ?? b.frozenOn ?? "";
  return ka < kb ? -1 : ka > kb ? 1 : a.id < b.id ? -1 : 1;
}

export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

export type PotjeChoice = {
  name: string;
  /** How many meals of this can still be planned for the assignee. */
  count: number;
  /** How many of those are in the freezer today; the rest are still to be cooked. */
  inFreezer: number;
  /** When the first not-yet-cooked one becomes eatable (null = none pending). */
  nextReadyOn: string | null;
};

/** What the "Potje diepvries" menu offers for a meal on `date`. A Samen meal
 *  needs one Robin AND one Amber portion of the same dish. */
export function potjeChoices(
  portions: Portion[],
  date: string,
  assignee: "both" | Who,
  today: string,
): PotjeChoice[] {
  const whos: Who[] = assignee === "both" ? ["robin", "amber"] : [assignee];
  const perWho = whos.map((w) => groupByName(availablePortions(portions, date, w, today)));
  const names = [...perWho[0].keys()].filter((k) => perWho.every((m) => m.has(k)));
  return names
    .map((key) => {
      const lists = perWho.map((m) => m.get(key)!);
      const count = Math.min(...lists.map((l) => l.length));
      const inFreezer = Math.min(...lists.map((l) => l.filter((p) => isInFreezer(p, today)).length));
      const pending = lists
        .flatMap((l) => l.filter((p) => !isInFreezer(p, today)))
        .map((p) => readyOn(p))
        .filter((d): d is string => !!d)
        .sort();
      return {
        name: lists[0][0].name,
        count,
        inFreezer: Math.min(inFreezer, count),
        nextReadyOn: inFreezer >= count ? null : pending[0] ?? null,
      };
    })
    .sort((a, b) => {
      if ((a.inFreezer > 0) !== (b.inFreezer > 0)) return a.inFreezer > 0 ? -1 : 1;
      return (a.nextReadyOn ?? "").localeCompare(b.nextReadyOn ?? "") || a.name.localeCompare(b.name, "nl");
    });
}

function groupByName(portions: Portion[]): Map<string, Portion[]> {
  const m = new Map<string, Portion[]>();
  for (const p of portions) {
    const k = nameKey(p.name);
    m.set(k, [...(m.get(k) ?? []), p]);
  }
  return m;
}

/** The portions to reserve for a meal: the oldest available one per person. */
export function pickPortions(
  portions: Portion[],
  name: string,
  date: string,
  assignee: "both" | Who,
  today: string,
): Portion[] | null {
  const whos: Who[] = assignee === "both" ? ["robin", "amber"] : [assignee];
  const picked: Portion[] = [];
  for (const w of whos) {
    const p = availablePortions(portions, date, w, today).find((x) => nameKey(x.name) === nameKey(name));
    if (!p) return null;
    picked.push(p);
  }
  return picked;
}

export type BlockedPotje = {
  name: string;
  who: Who;
  count: number;
  /** Why it can't be picked for this day. */
  reason:
    | { kind: "planned"; on: string } // another meal already eats it
    | { kind: "later"; readyOn: string } // cooked on or after this day
    | { kind: "partner" }; // Samen: the other person has none of this dish
};

/** The potjes the menu shows struck through for a meal on `date`, with why —
 *  so a portion never silently disappears from the list. */
export function blockedPotjes(
  portions: Portion[],
  date: string,
  assignee: "both" | Who,
  today: string,
): BlockedPotje[] {
  const whos: Who[] = assignee === "both" ? ["robin", "amber"] : [assignee];
  const lines = new Map<string, BlockedPotje>();
  const add = (p: { name: string; who: Who }, reason: BlockedPotje["reason"]) => {
    const on = reason.kind === "planned" ? reason.on : reason.kind === "later" ? reason.readyOn : "";
    const k = [nameKey(p.name), p.who, reason.kind, on].join("|");
    const line = lines.get(k) ?? { name: p.name, who: p.who, count: 0, reason };
    line.count++;
    lines.set(k, line);
  };
  for (const p of portions) {
    if (!whos.includes(p.who) || isConsumed(p, today)) continue;
    if (p.eatenByMealId && p.eatenOn) add(p, { kind: "planned", on: p.eatenOn });
    else if (readyOn(p) && readyOn(p)! > date) add(p, { kind: "later", readyOn: readyOn(p)! });
  }
  if (assignee === "both") {
    const avail = whos.map((w) => groupByName(availablePortions(portions, date, w, today)));
    whos.forEach((w, i) => {
      const other = whos[1 - i];
      for (const [key, list] of avail[i]) {
        const otherHas = avail[1 - i].has(key) || [...lines.values()].some((l) => l.who === other && nameKey(l.name) === key);
        if (!otherHas) add({ name: list[0].name, who: other }, { kind: "partner" });
      }
    });
  }
  return [...lines.values()].sort(
    (a, b) => a.name.localeCompare(b.name, "nl") || a.who.localeCompare(b.who),
  );
}

export type TimelineChange = { name: string; who: Who; delta: number };
export type TimelineDay = { date: string; counts: Record<Who, number>; changes: TimelineChange[] };

/** How many portions each person has in the freezer over `days` (ascending):
 *  `start` is the morning of the first day, each day's `counts` its evening.
 *  A cooked portion goes in on its cook day; an eaten one is gone that evening. */
export function freezerTimeline(
  portions: Portion[],
  days: string[],
): { start: Record<Who, number>; days: TimelineDay[] } {
  // When it goes in (null = already in) and the evening it is gone (null = stays).
  const spans = portions
    .filter((p) => !p.sourceMealId || p.cookOn)
    .map((p) => ({ p, from: p.sourceMealId ? p.cookOn : null, to: p.eatenOn }));
  const count = (pred: (s: (typeof spans)[number]) => boolean) => ({
    robin: spans.filter((s) => s.p.who === "robin" && pred(s)).length,
    amber: spans.filter((s) => s.p.who === "amber" && pred(s)).length,
  });

  const first = days[0];
  const start = first
    ? count((s) => (!s.from || s.from < first) && (!s.to || s.to >= first))
    : { robin: 0, amber: 0 };

  return {
    start,
    days: days.map((date) => {
      const changes = new Map<string, TimelineChange>();
      const add = (p: Portion, delta: number) => {
        const k = [nameKey(p.name), p.who, Math.sign(delta)].join("|");
        const c = changes.get(k) ?? { name: p.name, who: p.who, delta: 0 };
        c.delta += delta;
        changes.set(k, c);
      };
      for (const s of spans) {
        if (s.from === date) add(s.p, 1);
        if (s.to === date) add(s.p, -1);
      }
      return {
        date,
        counts: count((s) => (!s.from || s.from <= date) && (!s.to || s.to > date)),
        changes: [...changes.values()].sort((a, b) => b.delta - a.delta || a.name.localeCompare(b.name, "nl")),
      };
    }),
  };
}
