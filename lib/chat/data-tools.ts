// READ-ONLY data tools for the chat. Select-only on a fixed list of tables.
// No insert/update/delete/upsert/rpc may appear anywhere in lib/chat
// (enforced by scripts/test-chat-tools.ts).
import { tool } from "ai";
import { z } from "zod";
import { getDb } from "@/lib/supabase/server";
import { addIsoDays } from "@/lib/date";
import { getRecipe, getShoppingDocs, listGroenten, listPortions, listRecipes, listVleesjes } from "@/lib/data";

const MAX_ROWS = 60;

/** Flatten a TipTap/ProseMirror JSON document to plain lines. */
export function docToText(node: unknown): string {
  const lines: string[] = [];
  const walk = (n: any, prefix = "") => {
    if (!n || typeof n !== "object") return;
    if (n.type === "text") {
      lines[lines.length - 1] += n.text ?? "";
      return;
    }
    const block = ["paragraph", "heading", "taskItem", "listItem"].includes(n.type);
    if (block) {
      const done = n.type === "taskItem" ? (n.attrs?.checked ? "[x] " : "[ ] ") : "";
      lines.push(prefix + done);
    }
    for (const c of n.content ?? []) walk(c, prefix);
  };
  walk(node);
  return lines.map((l) => l.trim()).filter(Boolean).join("\n");
}

export const dataTools = {
  listRecipes: tool({
    description: "Zoek recepten (alleen titel, tags, bereidingstijd). Zonder zoekterm: de nieuwste.",
    inputSchema: z.object({ search: z.string().max(80).optional() }),
    execute: async ({ search }) => {
      const all = await listRecipes();
      const q = search?.trim().toLowerCase();
      const hits = q
        ? all.filter((r) => r.title.toLowerCase().includes(q) || r.tags.some((t) => t.toLowerCase().includes(q)))
        : all;
      return {
        total: hits.length,
        recipes: hits.slice(0, MAX_ROWS).map((r) => ({
          id: r.id,
          title: r.title,
          tags: r.tags,
          prepMinutes: r.prep_minutes,
          freezerFriendly: r.freezer_friendly,
          lastCookedOn: r.last_cooked_on,
        })),
      };
    },
  }),

  getRecipe: tool({
    description: "Haal één recept volledig op (ingrediënten, bereiding) met id of (deel van de) titel.",
    inputSchema: z.object({ id: z.string().uuid().optional(), title: z.string().max(120).optional() }),
    execute: async ({ id, title }) => {
      let r = id ? await getRecipe(id) : null;
      if (!r && title) {
        const q = title.trim().toLowerCase();
        const all = await listRecipes();
        r = all.find((x) => x.title.toLowerCase() === q) ?? all.find((x) => x.title.toLowerCase().includes(q)) ?? null;
      }
      if (!r) return { error: "Recept niet gevonden" };
      return {
        id: r.id,
        title: r.title,
        tags: r.tags,
        baseServings: r.base_servings,
        prepMinutes: r.prep_minutes,
        method: r.method,
        notes: r.notes,
        ingredients: r.ingredients.map((i) => ({ name: i.name, amount: i.amount, unit: i.unit })),
      };
    },
  }),

  getPlanning: tool({
    description: "De planning (maaltijden per dag) van een datumbereik, yyyy-MM-dd. Maximaal 60 dagen.",
    inputSchema: z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
    execute: async ({ from, to }) => {
      const end = to > addIsoDays(from, 60) ? addIsoDays(from, 60) : to;
      const { data, error } = await getDb()
        .from("plan_days")
        .select("day_date, note, amber_mode, robin_mode, plan_meals(freeform_title, raw_text, from_freezer, diner_keys, note, sort, recipe:recipes(title))")
        .gte("day_date", from)
        .lte("day_date", end)
        .order("day_date", { ascending: true });
      if (error) return { error: "Planning ophalen mislukt" };
      return {
        days: (data ?? []).map((d: any) => ({
          date: d.day_date,
          note: d.note,
          amberMode: d.amber_mode,
          robinMode: d.robin_mode,
          meals: [...(d.plan_meals ?? [])]
            .sort((a: any, b: any) => a.sort - b.sort)
            .map((m: any) => ({
              title: m.recipe?.title ?? m.freeform_title ?? m.raw_text,
              fromFreezer: m.from_freezer,
              diners: m.diner_keys,
              note: m.note,
            })),
        })),
      };
    },
  }),

  getFreezer: tool({
    description: "De diepvries: vleesjes, groenten en potjes, met wat er al voor geplande maaltijden gereserveerd is.",
    inputSchema: z.object({}),
    execute: async () => {
      const db = getDb();
      const [vleesjes, groenten, portions, res] = await Promise.all([
        listVleesjes(),
        listGroenten(),
        listPortions(),
        db
          .from("freezer_reservations")
          .select("amount, vleesje_id, groente_id, meal:plan_meals(freeform_title, raw_text, recipe:recipes(title), day:plan_days(day_date))")
          .is("settled_at", null),
      ]);
      const reservations = ((res.data ?? []) as any[]).map((r) => ({
        itemId: r.vleesje_id ?? r.groente_id,
        amount: r.amount,
        meal: r.meal?.recipe?.title ?? r.meal?.freeform_title ?? r.meal?.raw_text,
        day: r.meal?.day?.day_date,
      }));
      const reservedFor = (id: string) => reservations.filter((r) => r.itemId === id).map(({ amount, meal, day }) => ({ amount, meal, day }));
      const potjes: Record<string, { robin: number; amber: number; planned: number }> = {};
      for (const p of portions) {
        const e = (potjes[p.name] ??= { robin: 0, amber: 0, planned: 0 });
        if (p.eatenByMealId) e.planned++;
        else e[p.who]++;
      }
      return {
        vleesjes: vleesjes.map((v: any) => ({ name: v.name, count: v.count, unit: v.unit, reservedBy: reservedFor(v.id) })),
        groenten: groenten.map((g: any) => ({ name: g.name, amount: g.amount ?? g.count, unit: g.unit, reservedBy: reservedFor(g.id) })),
        potjes: Object.entries(potjes).map(([name, v]) => ({ name, ...v })),
      };
    },
  }),

  getShoppingList: tool({
    description: "De boodschappenlijst: handmatig deel en het door de planning gegenereerde deel, als tekst.",
    inputSchema: z.object({}),
    execute: async () => {
      const { manual, generated } = await getShoppingDocs();
      return { manual: docToText(manual) || null, fromPlanning: docToText(generated) || null };
    },
  }),
};

