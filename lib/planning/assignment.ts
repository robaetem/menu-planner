// Who eats a planned meal, and what changing that costs the freezer.
//
// A meal's `assignee` drives two things: how its ingredients scale
// (`diner_keys` / `diner_count`), and — for a "Potje diepvries" — how many
// potjes were taken out of the inventory, because a potje is stocked PER
// PERSON (see lib/planning/ingredient-quantity.ts).

import type { Assignee } from "@/lib/types";

/** Ingredient scaling for a meal assigned to `assignee`. */
export function dinersFor(assignee: Assignee): { diner_keys: string[]; diner_count: number } {
  if (assignee === "amber") return { diner_keys: ["amber"], diner_count: 1 };
  if (assignee === "robin") return { diner_keys: ["robin"], diner_count: 1 };
  return { diner_keys: ["robin", "amber"], diner_count: 2 };
}

/** Whose potje a meal consumes. "Samen" eats one of each. */
export function needs(assignee: Assignee): { robin: boolean; amber: boolean } {
  return {
    robin: assignee === "both" || assignee === "robin",
    amber: assignee === "both" || assignee === "amber",
  };
}

/** How the potjes inventory must change when a freezer meal moves from one
 *  person to another. Positive = hand back to the freezer, negative = take one
 *  more out of it (which can fail if there is none left). */
export function potjeDelta(
  from: Assignee,
  to: Assignee,
): { robin: number; amber: number } {
  const before = needs(from);
  const after = needs(to);
  const n = (b: boolean) => (b ? 1 : 0);
  return {
    robin: n(before.robin) - n(after.robin),
    amber: n(before.amber) - n(after.amber),
  };
}
