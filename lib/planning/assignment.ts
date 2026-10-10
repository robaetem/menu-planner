// Who eats a planned meal, and what changing that costs the freezer.
//
// A meal's `assignee` drives two things: how its ingredients scale
// (`diner_keys` / `diner_count`), and — for a "Potje diepvries" — whose
// frozen portions it eats, because a portion is frozen PER PERSON
// (see lib/freezer/potjes.ts).

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
