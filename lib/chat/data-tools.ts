// READ-ONLY data tools for the chat. Select-only on a fixed list of tables
// (CHAT_TABLES). No insert/update/delete/upsert/rpc may appear anywhere in
// lib/chat, and only allow-listed read helpers may be imported from elsewhere
// (both enforced by scripts/test-chat-tools.ts).
//
// Output is shaped for the model: names, dates with weekday, who eats, no ids.
import { tool } from "ai";
import { z } from "zod";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { getDb } from "@/lib/supabase/server";
import { addIsoDays, todayIso } from "@/lib/date";
import { getShoppingDocs, listPortions } from "@/lib/data";
import { loadStock } from "@/lib/freezer/stock-server";
import { mealStockStatus, type FreezerStock } from "@/lib/freezer/stock";
import { readyOn } from "@/lib/freezer/potjes";
import { resolveTitle } from "@/app/(protected)/planning/config";
import type { TemplateVleesje } from "@/lib/types";

/** Every table the chat may read. Nothing else, and only with select. */
export const CHAT_TABLES = [
  "household",
  "ingredient_category_map",
  "recipes",
  "ingredients",
  "recipe_tags",
  "plan_days",
  "plan_meals",
  "plan_modes",
  "ingredient_categories",
] as const;
type ChatTable = (typeof CHAT_TABLES)[number];
// Also read, through allow-listed helpers: vleesjes, groenten,
// freezer_reservations, freezer_portions, shopping_doc.

const from = (t: ChatTable) => getDb().from(t);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = z.string().regex(ISO, "yyyy-MM-dd");
const MAX_RANGE_DAYS = 92;
const MAX_ROWS = 80;

/** "za 7 nov 2026" */
export function dayLabel(iso: string): string {
  return format(parseISO(iso), "EEEEEE d MMM yyyy", { locale: nl });
}
const WHO: Record<string, string> = { both: "Samen", amber: "Amber", robin: "Robin" };

/** Lowercase, no accents, straight quotes: "Z’n Grieks" -> "z'n grieks". */
export function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`´]/g, "'")
    .toLowerCase()
    .trim();
}
/** Every word of `q` occurs in `hay` (like the Recepten search box). */
export function matchesAll(hay: string, q: string): boolean {
  const h = norm(hay);
  return norm(q).split(/\s+/).filter(Boolean).every((w) => h.includes(w) || (w.length > 3 && h.includes(w.replace(/(en|s)$/, ""))));
}

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
  // A task item's text sits in a nested paragraph: fold "[ ] " + "melk" into one line.
  const out: string[] = [];
  for (const l of lines.map((x) => x.trim())) {
    if (out.length && /^\[[ x]\]$/.test(out[out.length - 1]) && l) out[out.length - 1] += ` ${l}`;
    else out.push(l);
  }
  return out.filter((l) => l && !/^\[[ x]\]$/.test(l)).join("\n");
}

// ---------- shared loaders ----------

type MealRow = {
  id: string;
  sort: number;
  assignee: string;
  recipe_id: string | null;
  raw_text: string;
  freeform_title: string | null;
  from_freezer: boolean;
  freezer_robin: number;
  freezer_amber: number;
  template_vleesjes: TemplateVleesje[] | null;
  template_groenten: { name: string; unit: string; amount: number }[] | null;
  note: string | null;
  recipe: { title: string } | null;
};
type DayRow = { day_date: string; note: string | null; amber_mode: string | null; robin_mode: string | null; plan_meals: MealRow[] };

const MEAL_SELECT =
  "id, sort, assignee, recipe_id, raw_text, freeform_title, from_freezer, freezer_robin, freezer_amber, template_vleesjes, template_groenten, note, recipe:recipes(title)";

async function loadDays(fromIso?: string, toIso?: string): Promise<DayRow[]> {
  let q = from("plan_days").select(`day_date, note, amber_mode, robin_mode, plan_meals(${MEAL_SELECT})`);
  if (fromIso) q = q.gte("day_date", fromIso);
  if (toIso) q = q.lte("day_date", toIso);
  const { data, error } = await q.order("day_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as DayRow[];
}

async function loadModeLabels(): Promise<(who: "amber" | "robin", v: string | null) => string> {
  const { data } = await from("plan_modes").select("who, value, label");
  const m = new Map((data ?? []).map((r: any) => [`${r.who}|${r.value}`, r.label as string]));
  return (who, v) => (v ? (m.get(`${who}|${v}`) ?? v) : "Thuis");
}

function mealTitle(m: MealRow): string {
  return resolveTitle(m.recipe?.title ?? m.freeform_title ?? m.raw_text ?? "Maaltijd", m.template_vleesjes).trim();
}

function mealView(m: MealRow) {
  const v: Record<string, unknown> = {
    title: mealTitle(m),
    who: WHO[m.assignee] ?? m.assignee,
    kind: m.from_freezer ? "potje uit de diepvries" : m.recipe_id ? "gerecht (koken)" : "vrije tekst",
  };
  if (m.freezer_robin || m.freezer_amber) v.extraPotjesInvriezen = { Robin: m.freezer_robin, Amber: m.freezer_amber };
  const vl = (m.template_vleesjes ?? []).filter((x) => x.count > 0);
  if (vl.length) v.vleesjes = vl.map((x) => `${x.count} ${x.name} (${x.source === "buy" ? "kopen" : "uit diepvries"})`);
  const gr = m.template_groenten ?? [];
  if (gr.length) v.groentenUitDiepvries = gr.map((g) => `${g.amount} ${g.unit} ${g.name}`);
  if (m.note) v.note = m.note;
  return v;
}

const sortedMeals = (d: DayRow) => [...(d.plan_meals ?? [])].sort((a, b) => a.sort - b.sort);

// ---------- tools ----------

export const dataTools = {
  getPlanning: tool({
    description:
      "Planning per dag voor een periode (vroeger of later, max 92 dagen): wat er gegeten wordt, wie mee-eet (Samen/Amber/Robin), potjes uit de diepvries, extra potjes die worden ingevroren, gekozen vleesjes (uit diepvries of kopen), diepvriesgroenten (met wat er uit de diepvries gereserveerd is en een eventueel tekort, rood in de app), de situaties van Amber en Robin en de dagnotitie. Elke datum heeft zijn weekdag. Zonder datums: vandaag + 6 dagen. Voor 'wanneer aten we X' of 'hoe vaak': gebruik findMeals.",
    inputSchema: z.object({
      from: isoDate.optional().describe("Eerste dag, yyyy-MM-dd"),
      to: isoDate.optional().describe("Laatste dag, yyyy-MM-dd"),
    }),
    execute: async ({ from: f, to: t }) => {
      const today = todayIso();
      const start = f ?? today;
      let end = t ?? addIsoDays(start, 6);
      if (end < start) end = start;
      const capped = end > addIsoDays(start, MAX_RANGE_DAYS - 1);
      if (capped) end = addIsoDays(start, MAX_RANGE_DAYS - 1);
      // Freezer stock only matters for meals from today on (reservations, tekort).
      const stock = end >= today ? Promise.all([loadStock(getDb(), "vleesje"), loadStock(getDb(), "groente")]) : Promise.resolve(null);
      const [rows, mode, st] = await Promise.all([loadDays(start, end), loadModeLabels(), stock.catch(() => null)]);
      const freezerFor = (mealId: string) => {
        if (!st) return [];
        return st.flatMap((s) =>
          s.demands
            .filter((d) => d.mealId === mealId)
            .flatMap((d) => mealStockStatus(s.entries, s.reservations, d.mealId, d.lines))
            .map((x) => ({
              wat: x.name,
              nodig: `${+x.wanted.toFixed(3)}${x.unit ? ` ${x.unit}` : ""}`,
              gereserveerdUitDiepvries: `${+x.reserved.toFixed(3)}${x.unit ? ` ${x.unit}` : ""}`,
              ...(x.short > 1e-9 ? { tekort: `${+x.short.toFixed(3)}${x.unit ? ` ${x.unit}` : ""}` } : {}),
            })),
        );
      };
      const byDate = new Map(rows.map((r) => [r.day_date, r]));
      const days = [];
      for (let d = start; d <= end; d = addIsoDays(d, 1)) {
        const r = byDate.get(d);
        const meals = r
          ? sortedMeals(r).map((m) => {
              const v = mealView(m);
              const fz = d >= today ? freezerFor(m.id) : [];
              if (fz.length) v.diepvries = fz;
              if (fz.some((x) => "tekort" in x)) v.tekort = true;
              return v;
            })
          : [];
        const day: Record<string, unknown> = { date: d, day: dayLabel(d), meals };
        if (r?.amber_mode) day.amber = mode("amber", r.amber_mode);
        if (r?.robin_mode) day.robin = mode("robin", r.robin_mode);
        if (r?.note) day.note = r.note;
        if (!meals.length) day.empty = true;
        days.push(day);
      }
      return { today: dayLabel(today), from: start, to: end, ...(capped ? { capped: `max ${MAX_RANGE_DAYS} dagen` } : {}), days };
    },
  }),

  findMeals: tool({
    description:
      "Zoek in ALLE geplande en gegeten maaltijden (hele geschiedenis en toekomst) op naam van het gerecht, en in de dagnotities (bv. 'tante Sofie', 'restaurant'). Geeft per gerecht: hoe vaak, eerste keer, laatst gegeten (t.e.m. vandaag) en volgende keer gepland, plus de lijst met datums en wie at. Zonder zoekterm: alle gerechten in de periode, het vaakst eerst (voor 'wat eten we het meest'), en zonder `from` ook de allereerste maaltijd in de planning. Optioneel filteren op wie (Samen/Amber/Robin) of alleen potjes.",
    inputSchema: z.object({
      search: z.string().max(80).optional().describe("Deel van de gerechtnaam, bv. 'witte kool'"),
      from: isoDate.optional(),
      to: isoDate.optional(),
      who: z.enum(["Samen", "Amber", "Robin"]).optional().describe("Alleen maaltijden in dat vak"),
      onlyPotjes: z.boolean().optional().describe("Alleen potjes uit de diepvries"),
    }),
    execute: async ({ search, from: f, to: t, who, onlyPotjes }) => {
      const today = todayIso();
      const rows = await loadDays(f, t);
      const hits: { date: string; title: string; who: string; potje: boolean }[] = [];
      const notes: { day: string; note: string }[] = [];
      for (const d of rows) {
        if (search && d.note && matchesAll(d.note, search)) notes.push({ day: dayLabel(d.day_date), note: d.note });
        for (const m of sortedMeals(d)) {
          const title = mealTitle(m);
          if (search && !matchesAll(`${title} ${m.raw_text ?? ""}`, search)) continue;
          if (who && WHO[m.assignee] !== who) continue;
          if (onlyPotjes && !m.from_freezer) continue;
          hits.push({ date: d.day_date, title, who: WHO[m.assignee] ?? m.assignee, potje: m.from_freezer });
        }
      }
      // Group by dish: the recipe part of the title (before " met <vleesjes>").
      const groups = new Map<string, { dish: string; times: number; dates: string[] }>();
      for (const h of hits) {
        const key = norm(h.title.replace(/\s+met\s+\d.*$/i, ""));
        const g = groups.get(key) ?? { dish: h.title.replace(/\s+met\s+\d.*$/i, ""), times: 0, dates: [] };
        // Two single potjes (Robin + Amber) on one day count as one meal.
        if (!g.dates.includes(h.date)) {
          g.times++;
          g.dates.push(h.date);
        }
        groups.set(key, g);
      }
      const dishes = [...groups.values()]
        .map((g) => {
          const past = g.dates.filter((d) => d <= today);
          const future = g.dates.filter((d) => d > today);
          return {
            dish: g.dish,
            times: g.times,
            timesUntilToday: past.length,
            first: dayLabel(g.dates[0]),
            ...(past.length ? { lastUntilToday: dayLabel(past[past.length - 1]) } : {}),
            ...(future.length ? { nextPlanned: dayLabel(future[0]) } : {}),
          };
        })
        .sort((a, b) => b.times - a.times || a.dish.localeCompare(b.dish, "nl"));
      return {
        today: dayLabel(today),
        ...(hits.length && !f ? { eersteMaaltijdOoit: `${dayLabel(hits[0].date)}: ${hits[0].title}` } : {}),
        totalMeals: hits.length,
        dishes: dishes.slice(0, MAX_ROWS),
        meals: (search || who || onlyPotjes || hits.length <= MAX_ROWS ? hits : [])
          .slice(-MAX_ROWS)
          .map((h) => ({ day: dayLabel(h.date), title: h.title, who: h.who, ...(h.potje ? { potje: true } : {}) })),
        ...(notes.length ? { dagnotities: notes.slice(-MAX_ROWS) } : {}),
        ...(hits.length > MAX_ROWS ? { note: `Alleen de laatste ${MAX_ROWS} maaltijden staan in 'meals'.` } : {}),
      };
    },
  }),

  listRecipes: tool({
    description:
      "Zoek recepten op naam, tag of ingrediënt (alle woorden moeten voorkomen in naam, tags of ingrediënten). Geeft naam, tags, of je zelf een vleesje kiest, en hoe vaak/wanneer het gerecht ingepland was en weer is. Zonder zoekterm: alle recepten (totaal = aantal recepten). Gebruik `tag` voor een exacte tag (bv. 'Snel', 'Geen verse groenten nodig') en `neverPlanned` voor recepten die nog nooit in de planning stonden.",
    inputSchema: z.object({
      search: z.string().max(80).optional().describe("Woorden uit naam, tag of ingrediënt, bv. 'scampi'"),
      tag: z.string().max(60).optional().describe("Exacte tag (label), bv. 'Snel'"),
      ingredient: z.string().max(60).optional().describe("Alleen recepten met dit ingrediënt"),
      neverPlanned: z.boolean().optional(),
    }),
    execute: async ({ search, tag, ingredient, neverPlanned }) => {
      const today = todayIso();
      const [recipes, tags, meals] = await Promise.all([
        from("recipes").select("id, title, tags, has_vleesje, ingredients(name)").order("title"),
        from("recipe_tags").select("value, label"),
        from("plan_meals").select("recipe_id, raw_text, freeform_title, day:plan_days(day_date)"),
      ]);
      if (recipes.error) return { error: "Recepten ophalen mislukt" };
      const label = new Map((tags.data ?? []).map((t: any) => [t.value, t.label as string]));
      const tagLabels = (r: any) => (r.tags as string[]).map((t) => label.get(t) ?? t);
      // Planned dates per recipe: linked meals, plus potje meals whose name starts with the title.
      const planned = (r: any) => {
        const t = norm(r.title);
        return (meals.data ?? [])
          .filter((m: any) => m.recipe_id === r.id || (!m.recipe_id && norm(m.freeform_title ?? m.raw_text).startsWith(t)))
          .map((m: any) => m.day?.day_date as string)
          .filter(Boolean)
          .sort();
      };
      let list = (recipes.data ?? []) as any[];
      if (tag) list = list.filter((r) => [...tagLabels(r), ...r.tags].some((x: string) => norm(x) === norm(tag)));
      if (ingredient) list = list.filter((r) => r.ingredients.some((i: any) => matchesAll(i.name, ingredient)));
      if (search)
        list = list.filter((r) => matchesAll([r.title, ...tagLabels(r), ...r.tags, ...r.ingredients.map((i: any) => i.name)].join(" | "), search));
      const out = list.map((r) => {
        const dates = [...new Set(planned(r))];
        const past = dates.filter((d) => d <= today);
        const future = dates.filter((d) => d > today);
        const row: Record<string, unknown> = { title: r.title, tags: tagLabels(r), timesPlanned: dates.length };
        if (r.has_vleesje || /\[vleesje\]/i.test(r.title)) row.vleesjeKiezen = true;
        if (past.length) row.lastPlanned = dayLabel(past[past.length - 1]);
        if (future.length) row.nextPlanned = dayLabel(future[0]);
        const q = ingredient ?? search;
        if (q) {
          const hit = r.ingredients.filter((i: any) => matchesAll(i.name, q)).map((i: any) => i.name);
          if (hit.length) row.matchingIngredients = hit;
        }
        return row;
      });
      const filtered = neverPlanned ? out.filter((r) => r.timesPlanned === 0) : out;
      return { total: filtered.length, recipes: filtered.slice(0, MAX_ROWS) };
    },
  }),

  getRecipe: tool({
    description:
      "Eén recept volledig: ingrediënten met hoeveelheden (voor 2 personen samen, of per persoon), wat niet op het boodschappenlijstje komt, bereiding, notities, tags en wanneer het ingepland was/is. Noem hoeveelheden precies zoals ze er staan; verzin er geen bij. Zoek op (deel van) de naam; bij twijfel staan andere kandidaten in otherMatches.",
    inputSchema: z.object({ title: z.string().min(1).max(120).describe("(Deel van) de receptnaam") }),
    execute: async ({ title }) => {
      const [recipes, tags] = await Promise.all([
        from("recipes").select("id, title, tags, has_vleesje, base_servings, method, notes, image_path, ingredients(name, unit, scaling, amount, amount_max, amounts_per_person, include_in_shopping, sort)"),
        from("recipe_tags").select("value, label"),
      ]);
      if (recipes.error) return { error: "Recept ophalen mislukt" };
      const all = (recipes.data ?? []) as any[];
      const q = norm(title);
      const score = (r: any) => {
        const t = norm(r.title);
        return t === q ? 4 : t.startsWith(q) ? 3 : t.includes(q) ? 2 : matchesAll(r.title, title) ? 1 : 0;
      };
      const ranked = all.map((r) => ({ r, s: score(r) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.r.title.length - b.r.title.length);
      if (!ranked.length) return { error: `Geen recept gevonden voor "${title}"`, hint: "Probeer listRecipes met een kortere zoekterm." };
      const r = ranked[0].r;
      const { data: meals } = await from("plan_meals").select("day:plan_days(day_date)").eq("recipe_id", r.id);
      const today = todayIso();
      const dates = [...new Set((meals ?? []).map((m: any) => m.day?.day_date as string).filter(Boolean))].sort();
      const label = new Map((tags.data ?? []).map((t: any) => [t.value, t.label as string]));
      const qty = (a: number | null, max: number | null, unit: string) =>
        a == null ? unit || null : `${+(a * 2).toFixed(2)}${max != null ? `-${+(max * 2).toFixed(2)}` : ""}${unit ? ` ${unit}` : ""}`;
      const ingredients = [...r.ingredients]
        .sort((a: any, b: any) => a.sort - b.sort)
        .map((i: any) => {
          const row: Record<string, unknown> = { name: i.name };
          const per = i.amounts_per_person ?? {};
          if (i.scaling === "per_person" && Object.keys(per).length) {
            row.perPerson = Object.entries(per).map(([k, v]) => `${k === "amber" ? "Amber" : k === "robin" ? "Robin" : k} ${v}${i.unit ? ` ${i.unit}` : ""}`).join(", ");
          } else if (i.scaling === "fixed") {
            row.amount = i.amount == null ? "geen hoeveelheid ingevuld" : `${i.amount}${i.unit ? ` ${i.unit}` : ""} (vast)`;
          } else {
            row.amountSamen = i.amount == null ? "geen hoeveelheid ingevuld" : qty(i.amount, i.amount_max, i.unit);
          }
          if (!i.include_in_shopping) row.nietOpBoodschappenlijst = true;
          return row;
        });
      return {
        title: r.title,
        tags: (r.tags as string[]).map((t) => label.get(t) ?? t),
        ...(r.has_vleesje || /\[vleesje\]/i.test(r.title) ? { vleesjeKiezen: "het vlees kies je bij het inplannen" } : {}),
        hoeveelheden: "amountSamen = voor Robin en Amber samen (2 porties); één persoon = de helft",
        ingredients,
        method: r.method || null,
        notes: r.notes || null,
        foto: r.image_path ? (/^https?:/i.test(r.image_path) ? `link: ${r.image_path}` : "eigen foto opgeladen") : "geen foto",
        planned: {
          times: dates.length,
          last: dates.filter((d) => d <= today).map(dayLabel).pop() ?? null,
          next: dates.filter((d) => d > today).map(dayLabel)[0] ?? null,
        },
        ...(ranked.length > 1 ? { otherMatches: ranked.slice(1, 6).map((x) => x.r.title) } : {}),
      };
    },
  }),

  getFreezer: tool({
    description:
      "De diepvries nu: potjes per gerecht en per persoon (hoeveel erin, hoeveel al ingepland om op te eten en wanneer, en potjes die nog gekookt worden), vleesjes en groenten (hoeveel erin, hoeveel vrij, gereserveerd voor welke maaltijd op welke dag) en tekorten voor geplande maaltijden. Optioneel `search` op naam.",
    inputSchema: z.object({ search: z.string().max(60).optional().describe("Bv. 'hamburger' of 'quiche'") }),
    execute: async ({ search }) => {
      const today = todayIso();
      const db = getDb();
      const [portions, vStock, gStock] = await Promise.all([listPortions(), loadStock(db, "vleesje"), loadStock(db, "groente")]);
      const hit = (name: string) => !search || matchesAll(name, search);

      // Potjes: in the freezer now (manual, or cooked before today), and coming (cooked today or later).
      const potjes = new Map<string, { name: string; inFreezer: Record<string, number>; free: Record<string, number>; plannedToEat: string[] }>();
      const coming: string[] = [];
      for (const p of portions) {
        if (!hit(p.name)) continue;
        const who = p.who === "robin" ? "Robin" : "Amber";
        const cooked = !p.sourceMealId || (!!p.cookOn && p.cookOn < today);
        if (!cooked) {
          if (p.cookOn)
            coming.push(`${p.name} voor ${who}: wordt gekookt op ${dayLabel(p.cookOn)}, in de diepvries vanaf ${dayLabel(readyOn(p)!)}${p.eatenOn ? `, al ingepland op ${dayLabel(p.eatenOn)}` : ""}`);
          continue;
        }
        const k = norm(p.name);
        const e = potjes.get(k) ?? { name: p.name, inFreezer: { Robin: 0, Amber: 0 }, free: { Robin: 0, Amber: 0 }, plannedToEat: [] };
        e.inFreezer[who]++;
        if (p.eatenOn) e.plannedToEat.push(`${who} op ${dayLabel(p.eatenOn)}`);
        else e.free[who]++;
        potjes.set(k, e);
      }

      // Vleesjes/groenten: reservations whose day has passed are already eaten
      // (the app books them off on the next page load): leave them out here.
      const stockView = (s: FreezerStock, unitOf: (u: string) => string) => {
        const eaten = (id: string) => s.reservations.filter((r) => r.entryId === id && r.day < today).reduce((a, r) => a + r.amount, 0);
        const groups = new Map<string, { name: string; unit: string; inFreezer: number; reserved: { day: string; meal: string; amount: number }[] }>();
        for (const e of s.entries) {
          if (!hit(e.name)) continue;
          const k = `${norm(e.name)}|${e.unit}`;
          const g = groups.get(k) ?? { name: e.name, unit: unitOf(e.unit), inFreezer: 0, reserved: [] };
          g.inFreezer += Math.max(0, e.amount - eaten(e.id));
          for (const r of s.reservations.filter((x) => x.entryId === e.id && x.day >= today))
            g.reserved.push({ day: dayLabel(r.day), meal: r.mealTitle, amount: r.amount });
          groups.set(k, g);
        }
        return [...groups.values()]
          .filter((g) => g.inFreezer > 0 || g.reserved.length)
          .map((g) => {
            const reserved = g.reserved.reduce((a, r) => a + r.amount, 0);
            const u = g.unit ? ` ${g.unit}` : "";
            return {
              naam: g.name,
              inDiepvries: `${+g.inFreezer.toFixed(3)}${u}`,
              vrij: `${Math.max(0, +(g.inFreezer - reserved).toFixed(3))}${u}`,
              ...(g.reserved.length ? { gereserveerd: g.reserved.map((r) => `${+r.amount.toFixed(3)}${u} voor ${r.meal} op ${r.day}`) } : {}),
            };
          })
          .sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
      };
      const shortages = (s: FreezerStock, kind: string) =>
        s.demands.flatMap((d) =>
          mealStockStatus(s.entries, s.reservations, d.mealId, d.lines)
            .filter((x) => x.short > 1e-9 && hit(x.name))
            .map((x) => `${dayLabel(d.day)}: ${x.name} (${kind}) ${+x.short.toFixed(3)}${x.unit ? ` ${x.unit}` : ""} tekort; nodig ${+x.wanted.toFixed(3)}, uit de diepvries ${+x.reserved.toFixed(3)}`),
        );
      const potjesList = [...potjes.values()].sort((a, b) => a.name.localeCompare(b.name, "nl"));
      const total = (w: string) => potjesList.reduce((a, p) => a + p.inFreezer[w], 0);
      return {
        today: dayLabel(today),
        potjes: {
          totaalInDiepvries: `Robin ${total("Robin")}, Amber ${total("Amber")}`,
          vrijTotaal: `Robin ${potjesList.reduce((a, p) => a + p.free.Robin, 0)}, Amber ${potjesList.reduce((a, p) => a + p.free.Amber, 0)}`,
          perGerecht: potjesList.map((p) => ({
            naam: p.name,
            inDiepvries: `Robin ${p.inFreezer.Robin}, Amber ${p.inFreezer.Amber}`,
            vrij: `Robin ${p.free.Robin}, Amber ${p.free.Amber}`,
            ...(p.plannedToEat.length ? { alIngepland: p.plannedToEat } : {}),
          })),
          nogTeKoken: coming,
        },
        vleesjes: stockView(vStock, () => ""),
        groenten: stockView(gStock, (u) => u),
        tekorten: [...shortages(vStock, "vleesje"), ...shortages(gStock, "groente")],
        uitleg: "vrij = nog niet ingepland of gereserveerd. Vleesjes en groenten gaan pas van de teller na de dag van de maaltijd; potjes zijn per persoon.",
      };
    },
  }),

  getShoppingList: tool({
    description:
      "Het boodschappenlijstje: 'Zelf toegevoegd' (wat je zelf typte) en 'Uit je planning' (gemaakt uit gekozen dagen van de planning), plus per regel uit de planning van welke maaltijden en dagen het komt (voor 'waarom staat X op de lijst'). [x] = afgevinkt.",
    inputSchema: z.object({}),
    execute: async () => {
      const { manual, generated, generatedOrigins } = await getShoppingDocs();
      return {
        zelfToegevoegd: docToText(manual) || null,
        uitJePlanning: docToText(generated) || null,
        herkomst: (generatedOrigins?.lines ?? []).map((l) => ({
          line: l.label,
          from: l.origins.map((o) => `${o.meal} (${dayLabel(o.date)}${o.assignee && o.assignee !== "both" ? `, ${WHO[o.assignee] ?? o.assignee}` : ""}): ${o.amount}`),
        })),
      };
    },
  }),

  getSettings: tool({
    description:
      "Lijsten die je in de app zelf beheert: recept-tags, de situaties per persoon (Amber/Robin, bv. 'tot 18u', 'Thuiswerk'; zonder keuze 'Thuis'), de winkelsecties van het boodschappenlijstje, wie er in het huishouden is en tot wanneer de planning loopt. Met `ingredient`: in welke winkelsectie dat ingrediënt staat.",
    inputSchema: z.object({ ingredient: z.string().max(80).optional().describe("Optioneel: toon de winkelsectie van ingrediënten die hierop lijken") }),
    execute: async ({ ingredient }) => {
      const [tags, modes, cats, hh, map] = await Promise.all([
        from("recipe_tags").select("label, sort").order("sort"),
        from("plan_modes").select("who, label, sort").order("sort"),
        from("ingredient_categories").select("id, name, sort").order("sort"),
        from("household").select("name, diners, plan_horizon").limit(1).maybeSingle(),
        ingredient ? from("ingredient_category_map").select("name, category_id, source").ilike("name", `%${ingredient.replace(/[%_]/g, "")}%`).limit(20) : Promise.resolve({ data: null }),
      ]);
      const catName = new Map(((cats.data ?? []) as any[]).map((c) => [c.id, c.name]));
      const ms = (modes.data ?? []) as any[];
      return {
        household: hh.data?.name ?? "Robin & Amber",
        people: ((hh.data?.diners as any[]) ?? []).map((d) => d.label),
        tags: (tags.data ?? []).map((t: any) => t.label),
        situaties: {
          Amber: ["Thuis (standaard)", ...ms.filter((m) => m.who === "amber").map((m) => m.label)],
          Robin: ["Thuis (standaard)", ...ms.filter((m) => m.who === "robin").map((m) => m.label)],
        },
        winkelsecties: (cats.data ?? []).map((c: any) => c.name),
        planningLooptTot: hh.data?.plan_horizon ? dayLabel(hh.data.plan_horizon) : null,
        ...(ingredient
          ? {
              ingredientSecties: ((map.data ?? []) as any[]).map((m) => ({
                ingredient: m.name,
                sectie: catName.get(m.category_id) ?? "Overig",
                gekozen: m.source === "ai" ? "automatisch" : "zelf gekozen",
              })),
            }
          : {}),
      };
    },
  }),
};
