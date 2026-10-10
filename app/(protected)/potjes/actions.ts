"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/supabase/server";
import { todayIso } from "@/lib/date";
import { listPortions } from "@/lib/data";
import { isInFreezer, nameKey, type Portion, type Who } from "@/lib/freezer/potjes";

function clampCount(n: number): number {
  return Math.max(0, Math.min(99, Math.floor(n) || 0));
}

function revalidateFreezer() {
  revalidatePath("/potjes");
  revalidatePath("/diepvries");
  revalidatePath("/planning");
}

/** Remember a potje name for the add-potje autocomplete (case-insensitively
 *  deduped). The history only ever grows — it survives the potje itself. */
export async function recordPotjeName(name: string): Promise<void> {
  const t = name.trim();
  if (!t) return;
  const db = getDb();
  const { data: existing } = await db.from("potje_names").select("id").ilike("name", t).maybeSingle();
  if (existing) return;
  await db.from("potje_names").insert({ name: t });
}

/** Put portions in the freezer by hand (something frozen outside the plan). */
export async function createPotje(name: string, robin: number, amber: number): Promise<void> {
  const db = getDb();
  const t = name.trim();
  if (!t) return;
  const today = todayIso();
  const rows = (["robin", "amber"] as Who[]).flatMap((who) =>
    Array.from({ length: clampCount(who === "robin" ? robin : amber) }, () => ({ who, name: t, frozen_on: today })),
  );
  if (rows.length) {
    const { error } = await db.from("freezer_portions").insert(rows);
    if (error) throw error;
  }
  await recordPotjeName(t);
  revalidateFreezer();
}

/** Portions of this dish that are in the freezer now and not planned yet —
 *  the only ones a hand correction may touch. */
function correctable(portions: Portion[], name: string, who?: Who): Portion[] {
  const today = todayIso();
  return portions.filter(
    (p) =>
      nameKey(p.name) === nameKey(name) &&
      (!who || p.who === who) &&
      !p.eatenByMealId &&
      isInFreezer(p, today),
  );
}

/** +1 / -1 on a dish's count for one person (a hand correction). */
export async function adjustPotje(name: string, who: Who, delta: 1 | -1): Promise<void> {
  const db = getDb();
  const portions = await listPortions();
  if (delta > 0) {
    const { error } = await db.from("freezer_portions").insert({ who, name: name.trim(), frozen_on: todayIso() });
    if (error) throw error;
  } else {
    // Prefer a hand-entered one; never one that is planned to be eaten.
    const pick = correctable(portions, name, who).sort((a, b) => Number(!!a.sourceMealId) - Number(!!b.sourceMealId))[0];
    if (!pick) throw new Error("Alle potjes hiervan zijn al ingepland.");
    const { error } = await db.from("freezer_portions").delete().eq("id", pick.id);
    if (error) throw error;
  }
  revalidateFreezer();
}

/** Remove a dish from the freezer. Portions already planned stay (their meal
 *  still needs them); returns how many were kept for that reason. */
export async function deletePotje(name: string): Promise<number> {
  const db = getDb();
  const portions = await listPortions();
  const ids = correctable(portions, name).map((p) => p.id);
  if (ids.length) {
    const { error } = await db.from("freezer_portions").delete().in("id", ids);
    if (error) throw error;
  }
  revalidateFreezer();
  const today = todayIso();
  return portions.filter((p) => nameKey(p.name) === nameKey(name) && p.eatenByMealId && isInFreezer(p, today)).length;
}
