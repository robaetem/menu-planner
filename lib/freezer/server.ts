// Server-side bookkeeping for frozen portions (see lib/freezer/potjes.ts for
// the model). Only called from server actions.

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDayLabel } from "@/lib/date";
import type { Portion, Who } from "@/lib/freezer/potjes";

/** Keep a cooking meal's portions in line with its "+N potjes" per person.
 *  Removing takes unreserved portions first and refuses to drop one that
 *  another day is already planned to eat. */
export async function syncCookedPortions(
  db: SupabaseClient,
  mealId: string,
  want: Record<Who, number>,
  portions: Portion[],
): Promise<void> {
  for (const who of ["robin", "amber"] as Who[]) {
    const mine = portions.filter((p) => p.sourceMealId === mealId && p.who === who);
    const diff = want[who] - mine.length;
    if (diff > 0) {
      const rows = Array.from({ length: diff }, () => ({ who, source_meal_id: mealId }));
      const { error } = await db.from("freezer_portions").insert(rows);
      if (error) throw error;
    } else if (diff < 0) {
      const free = mine.filter((p) => !p.eatenByMealId);
      if (free.length < -diff) {
        const planned = mine.find((p) => p.eatenByMealId && p.eatenOn);
        throw new Error(
          `Dit potje staat al ingepland${planned ? ` op ${formatDayLabel(planned.eatenOn!)}` : ""}. Haal dat eerst weg.`,
        );
      }
      const ids = free.slice(diff).map((p) => p.id); // the newest ones
      const { error } = await db.from("freezer_portions").delete().in("id", ids);
      if (error) throw error;
    }
  }
}

/** A cooking meal can't move to (or past) a day on which one of its portions
 *  is already planned to be eaten. */
export function assertCookBefore(portions: Portion[], mealId: string, cookOn: string): void {
  const clash = portions
    .filter((p) => p.sourceMealId === mealId && p.eatenOn && p.eatenOn <= cookOn)
    .sort((a, b) => (a.eatenOn! < b.eatenOn! ? -1 : 1))[0];
  if (clash) {
    throw new Error(
      `Een potje van dit gerecht staat al ingepland op ${formatDayLabel(clash.eatenOn!)}. Het moet vóór die dag gemaakt worden.`,
    );
  }
}
