/* Chat tool eval against PRODUCTION Supabase, read-only.
 *
 *   corepack pnpm dlx tsx scripts/eval-chat-tools.ts [--only id,id] [--label before] [--concurrency 4]
 *
 * Runs realistic questions (incl. multi-turn) through the same streamText +
 * tools + system prompt as app/api/chat/route.ts. proposeChange and
 * proposeCodeChange are stubbed as "approved" without applying anything (the
 * proposal is validated and shown to the judge). Ground truth comes from raw select queries on a snapshot taken at
 * start (independent of the chat tools); a judge model grades each answer.
 * Every Supabase/GitHub request that is not GET/HEAD throws (scripts/eval-env.ts).
 * Writes docs/eval/<label>.json. Never prints secrets. */
import { writeAttempts } from "./eval-env";
import { mkdirSync, writeFileSync } from "node:fs";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, stepCountIs, streamText, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { getDb } from "@/lib/supabase/server";
import { systemPrompt } from "@/lib/chat/system-prompt";
import { buildChatTools } from "@/lib/chat/tools";
import { addIsoDays, todayIso } from "@/lib/date";
import { resolveTitle } from "@/app/(protected)/planning/config";

const MODEL = "z-ai/glm-5.3-flash";
const JUDGE = process.env.EVAL_JUDGE ?? "anthropic/claude-sonnet-4.5";
const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const ONLY = arg("only")?.split(",");
const LABEL = arg("label") ?? "run";
const CONCURRENCY = Number(arg("concurrency") ?? 4);

const TODAY = todayIso();
const WHO = (a: string) => (a === "both" ? "Samen" : a === "amber" ? "Amber" : "Robin");

// ---------- snapshot (raw selects, independent of lib/chat) ----------
type SMeal = { date: string; title: string; who: string; fromFreezer: boolean; extra: { robin: number; amber: number }; vleesjes: any[]; groenten: any[]; note: string | null };
type SDay = { date: string; note: string | null; amber: string | null; robin: string | null; meals: SMeal[] };
async function snapshot() {
  const db = getDb();
  const [days, recipes, tags, modes, vleesjes, groenten, res, portions, shop] = await Promise.all([
    db.from("plan_days").select("day_date, note, amber_mode, robin_mode, plan_meals(id, sort, assignee, raw_text, freeform_title, from_freezer, freezer_robin, freezer_amber, template_vleesjes, template_groenten, note, recipe:recipes(title))").order("day_date"),
    db.from("recipes").select("title, tags, has_vleesje, method, notes, base_servings, ingredients(name, amount, unit, scaling, amounts_per_person, include_in_shopping, sort)").order("title"),
    db.from("recipe_tags").select("value, label").order("sort"),
    db.from("plan_modes").select("who, value, label").order("sort"),
    db.from("vleesjes").select("id, name, count"),
    db.from("groenten").select("id, name, amount, unit"),
    db.from("freezer_reservations").select("amount, vleesje_id, groente_id, meal:plan_meals(day:plan_days(day_date))").is("settled_at", null),
    db.from("freezer_portions").select("who, name, frozen_on, source:plan_meals!freezer_portions_source_meal_id_fkey(freeform_title, raw_text, template_vleesjes, recipe:recipes(title), day:plan_days(day_date)), eaten:plan_meals!freezer_portions_eaten_by_meal_id_fkey(day:plan_days(day_date))"),
    db.from("shopping_doc").select("content, generated_content, generated_origins").order("id").limit(1).maybeSingle(),
  ]);
  for (const r of [days, recipes, tags, modes, vleesjes, groenten, res, portions, shop]) if (r.error) throw r.error;
  const modeLabel = (who: string, v: string | null) => (v ? (modes.data!.find((m: any) => m.who === who && m.value === v)?.label ?? v) : null);
  const sdays: SDay[] = days.data!.map((d: any) => ({
    date: d.day_date,
    note: d.note,
    amber: modeLabel("amber", d.amber_mode),
    robin: modeLabel("robin", d.robin_mode),
    meals: [...d.plan_meals].sort((a: any, b: any) => a.sort - b.sort).map((m: any) => ({
      date: d.day_date,
      title: resolveTitle(m.recipe?.title ?? m.freeform_title ?? m.raw_text, m.template_vleesjes),
      who: WHO(m.assignee),
      fromFreezer: m.from_freezer,
      extra: { robin: m.freezer_robin, amber: m.freezer_amber },
      vleesjes: m.template_vleesjes,
      groenten: m.template_groenten,
      note: m.note,
    })),
  }));
  // What is physically in the freezer now: settle past reservations in memory.
  const open = res.data!.filter((r: any) => (r.meal?.day?.day_date ?? "") >= TODAY);
  const past = res.data!.filter((r: any) => (r.meal?.day?.day_date ?? "") < TODAY);
  const stock = (rows: any[], fk: string, amountOf: (r: any) => number) =>
    rows.map((e) => {
      const used = past.filter((r: any) => r[fk] === e.id).reduce((s: number, r: any) => s + Number(r.amount), 0);
      const amount = Math.max(0, amountOf(e) - used);
      const reserved = open.filter((r: any) => r[fk] === e.id).map((r: any) => ({ day: r.meal?.day?.day_date, amount: Number(r.amount) }));
      return { name: e.name.trim(), unit: e.unit ?? "", amount, reserved };
    });
  const potjes = portions.data!.map((p: any) => {
    const name = p.source ? resolveTitle(p.source.recipe?.title ?? p.source.freeform_title ?? p.source.raw_text ?? "Potje", p.source.template_vleesjes) : p.name;
    const cookOn = p.source?.day?.day_date ?? null;
    const eatenOn = p.eaten?.day?.day_date ?? null;
    const inFreezer = !(eatenOn && eatenOn < TODAY) && (!p.source || (!!cookOn && cookOn < TODAY));
    return { who: p.who, name, cookOn, eatenOn, inFreezer };
  });
  return {
    days: sdays,
    meals: sdays.flatMap((d) => d.meals),
    recipes: recipes.data as any[],
    tags: tags.data as any[],
    modes: modes.data as any[],
    vleesjes: byName(stock(vleesjes.data!, "vleesje_id", (e) => Number(e.count))),
    groenten: byName(stock(groenten.data!, "groente_id", (e) => Number(e.amount))),
    potjes,
    shop: shop.data as any,
  };
}
type Snap = Awaited<ReturnType<typeof snapshot>>;
/** One line per name (the app also adds batches up); empty batches dropped. */
function byName(list: any[]) {
  const m = new Map<string, any>();
  for (const e of list) {
    const k = `${e.name.toLowerCase()}|${e.unit ?? ""}`;
    const cur = m.get(k) ?? { ...e, amount: 0, reserved: [] };
    cur.amount += e.amount;
    cur.reserved = [...cur.reserved, ...e.reserved];
    m.set(k, cur);
  }
  return [...m.values()].filter((e) => e.amount > 0 || e.reserved.length);
}

// ---------- questions ----------
const day = (s: Snap, date: string) => s.days.find((d) => d.date === date);
const WD = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const fmtDay = (d?: SDay) =>
  d ? `${WD[dow(d.date)]} ${d.date}: ${d.meals.map((m) => `${m.title} (${m.who}${m.fromFreezer ? ", potje uit diepvries" : ""}${m.extra.robin + m.extra.amber ? `, extra potjes R${m.extra.robin}/A${m.extra.amber}` : ""})`).join("; ") || "niets gepland"}${d.note ? ` | notitie: ${d.note}` : ""}${d.amber ? ` | Amber: ${d.amber}` : ""}${d.robin ? ` | Robin: ${d.robin}` : ""}` : "geen rij (niets gepland)";
const range = (s: Snap, from: string, to: string) => s.days.filter((d) => d.date >= from && d.date <= to).map(fmtDay).join("\n");
const recipe = (s: Snap, t: string) => s.recipes.find((r) => r.title.toLowerCase().includes(t.toLowerCase()));
// Recipe amounts as the app shows them for "Samen" (2 servings); per_person per name.
const ing = (r: any) =>
  [...r.ingredients].sort((a: any, b: any) => a.sort - b.sort).map((i: any) =>
    i.scaling === "per_person" && Object.keys(i.amounts_per_person ?? {}).length
      ? `${i.name} (per persoon: ${Object.entries(i.amounts_per_person).map(([k, v]) => `${k} ${v} ${i.unit}`).join(", ")})`
      : `${i.amount != null ? (i.scaling === "fixed" ? i.amount : +(i.amount * 2).toFixed(2)) : ""} ${i.unit} ${i.name}`.trim(),
  ).join(", ") + " (hoeveelheden voor Samen = 2 personen)";
const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const lastWeekday = (wd: number) => { let d = addIsoDays(TODAY, -7); while (dow(d) !== wd) d = addIsoDays(d, 1); return d; };
const prevMonth = () => { const [y, m] = TODAY.split("-").map(Number); const pm = m === 1 ? 12 : m - 1; const py = m === 1 ? y - 1 : y; const from = `${py}-${String(pm).padStart(2, "0")}-01`; return { from, to: addIsoDays(`${y}-${String(m).padStart(2, "0")}-01`, -1) }; };
const mealsMatching = (s: Snap, q: string) => s.meals.filter((m) => m.title.toLowerCase().includes(q.toLowerCase()));
const potjesNow = (s: Snap, who?: string) => {
  const m = new Map<string, Record<"robin" | "amber", { in: number; planned: string[] }>>();
  for (const p of s.potjes.filter((p) => p.inFreezer && (!who || p.who === who))) {
    const e = m.get(p.name) ?? { robin: { in: 0, planned: [] }, amber: { in: 0, planned: [] } };
    const k = p.who as "robin" | "amber";
    e[k].in++;
    if (p.eatenOn) e[k].planned.push(p.eatenOn);
    m.set(p.name, e);
  }
  const part = (n: string, v: { in: number; planned: string[] }) => (v.in ? `${n} ${v.in} in diepvries, waarvan ${v.planned.length} al ingepland${v.planned.length ? ` (${v.planned.join(", ")})` : ""}, dus ${v.in - v.planned.length} vrij` : "");
  return [...m].map(([n, v]) => `${n}: ${[part("Robin", v.robin), part("Amber", v.amber)].filter(Boolean).join("; ")}`).join("\n");
};
const stockLine = (e: any) => `${e.name}: ${e.amount}${e.unit ? " " + e.unit : ""} in diepvries${e.reserved.length ? `, gereserveerd: ${e.reserved.map((r: any) => `${r.amount} voor ${r.day}`).join(", ")}` : ""}`;

const CAL = Array.from({ length: 160 }, (_, i) => addIsoDays(TODAY, i - 130)).map((d) => `${d} ${WD[dow(d)].slice(0, 2)}`).join(", ");
const NEXT_MON = (() => { let d = addIsoDays(TODAY, 1); while (dow(d) !== 1) d = addIsoDays(d, 1); return d; })();

type Q = { id: string; cat: string; turns: string[]; truth: (s: Snap) => string; expectTool?: "proposeChange" | "proposeCodeChange" | "none" };
const Qs: Q[] = [
  // planning
  { id: "tonight", cat: "planning", turns: ["Wat eten we vanavond?"], truth: (s) => fmtDay(day(s, TODAY)) },
  { id: "tomorrow", cat: "planning", turns: ["Wat eten we morgen?"], truth: (s) => fmtDay(day(s, addIsoDays(TODAY, 1))) },
  { id: "next7", cat: "planning", turns: ["Wat staat er de komende 7 dagen op het menu?"], truth: (s) => range(s, TODAY, addIsoDays(TODAY, 6)) },
  { id: "robin-mon", cat: "planning", turns: ["Wat eet Robin maandag?"], truth: (s) => { let d = addIsoDays(TODAY, 1); while (dow(d) !== 1) d = addIsoDays(d, 1); return fmtDay(day(s, d)) + " (Samen-maaltijden gelden ook voor Robin)"; } },
  { id: "who-tue", cat: "planning", turns: ["Wie eet er mee op dinsdag 10 november en wat?"], truth: (s) => fmtDay(day(s, "2026-11-10")) },
  { id: "fz-days", cat: "planning", turns: ["Op welke dagen eten we de komende twee weken een potje uit de diepvries?"], truth: (s) => s.meals.filter((m) => m.fromFreezer && m.date >= TODAY && m.date <= addIsoDays(TODAY, 13)).map((m) => `${m.date} ${m.title} (${m.who})`).join("\n") },
  { id: "amber-modes", cat: "planning", turns: ["Op welke dagen werkt Amber de komende twee weken tot 18u?"], truth: (s) => s.days.filter((d) => d.date >= TODAY && d.date <= addIsoDays(TODAY, 13) && d.amber === "tot 18u").map((d) => d.date).join(", ") },
  { id: "note-today", cat: "planning", turns: ["Staat er een notitie bij vandaag?"], truth: (s) => day(s, TODAY)?.note ?? "geen notitie" },
  { id: "empty-days", cat: "planning", turns: ["Welke dagen in de komende twee weken hebben nog geen maaltijd?"], truth: (s) => { const out: string[] = []; for (let d = TODAY; d <= addIsoDays(TODAY, 13); d = addIsoDays(d, 1)) if (!day(s, d)?.meals.length) out.push(d); return out.join(", "); } },
  { id: "extra-potjes", cat: "planning", turns: ["Van welke maaltijden maken we de komende 10 dagen extra potjes voor de diepvries?"], truth: (s) => s.meals.filter((m) => m.date >= TODAY && m.date <= addIsoDays(TODAY, 9) && m.extra.robin + m.extra.amber > 0).map((m) => `${m.date} ${m.title}: Robin ${m.extra.robin}, Amber ${m.extra.amber}`).join("\n") },
  { id: "vleesje-plan", cat: "planning", turns: ["Welk vlees eten we bij de bloemkool volgende week en moet ik dat kopen?"], truth: (s) => mealsMatching(s, "bloemkool").filter((m) => m.date >= TODAY).map((m) => `${m.date} ${m.title}: ${JSON.stringify(m.vleesjes)} (source freezer = uit diepvries, buy = kopen)`).join("\n") },
  // history
  { id: "last-month", cat: "history", turns: ["Wat hebben we vorige maand gegeten?"], truth: (s) => { const { from, to } = prevMonth(); return range(s, from, to); } },
  { id: "last-wittekool", cat: "history", turns: ["Wanneer hebben we voor het laatst witte kool gegeten?"], truth: (s) => mealsMatching(s, "witte kool").filter((m) => m.date <= TODAY).map((m) => m.date).pop() ?? "nooit" },
  { id: "count-curry", cat: "history", turns: ["Hoe vaak hebben we al kip curry gegeten?"], truth: (s) => mealsMatching(s, "curry").filter((m) => m.date <= TODAY).map((m) => `${m.date} ${m.title} (${m.who}${m.fromFreezer ? ", potje" : ""})`).join("\n") },
  { id: "last-wed", cat: "history", turns: ["Wat aten we vorige week woensdag?"], truth: (s) => fmtDay(day(s, lastWeekday(3))) },
  { id: "most-often", cat: "history", turns: ["Welk gerecht hebben we het vaakst gegeten?"], truth: (s) => { const c = new Map<string, Set<string>>(); for (const m of s.meals.filter((m) => m.date <= TODAY)) { const k = m.title.replace(/\s+met\s+\d.*$/i, ""); const e = c.get(k) ?? new Set<string>(); e.add(m.date); c.set(k, e as any); } return [...c].map(([t, e]: any) => [t, e.size] as const).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, n]) => `${t}: ${n} dagen`).join("\n") + "\n(geteld per dag; Robin en Amber apart op dezelfde dag = 1 keer. Een telling die 1 verschilt is ok zolang de top klopt)"; } },
  { id: "robin-alone-oct", cat: "history", turns: ["Wat at Robin in oktober allemaal alleen?"], truth: (s) => s.meals.filter((m) => m.date.startsWith("2026-10") && m.who === "Robin").map((m) => `${m.date} ${m.title}`).join("\n") },
  { id: "tante-sofie", cat: "history", turns: ["Wanneer gingen we eten bij tante Sofie?"], truth: (s) => s.days.filter((d) => /sofie/i.test(d.note ?? "")).map((d) => `${d.date}: ${d.note}`).join("\n") },
  { id: "oct1", cat: "history", turns: ["Wat hebben we op 1 oktober gegeten?"], truth: (s) => fmtDay(day(s, "2026-10-01")) },
  { id: "first-ever", cat: "history", turns: ["Sinds wanneer gebruiken we de planning? Wat was de eerste dag?"], truth: (s) => fmtDay(s.days.find((d) => d.meals.length)) },
  { id: "not-eaten-long", cat: "history", turns: ["Welke recepten hebben we nog nooit ingepland?"], truth: (s) => s.recipes.filter((r) => !s.meals.some((m) => m.title.toLowerCase().startsWith(r.title.toLowerCase()))).map((r) => r.title).join(", ") + "\n(een recept telt als ingepland als een maaltijd die titel heeft; kleine verschillen in de lijst zijn ok als het grootste deel klopt)" },
  // recipes
  { id: "scampi", cat: "recipes", turns: ["Welke recepten hebben we met scampi?"], truth: (s) => s.recipes.filter((r) => /scampi/i.test(r.title) || r.ingredients.some((i: any) => /scampi/i.test(i.name))).map((r) => r.title).join(", ") },
  { id: "snel", cat: "recipes", turns: ["Welke snelle recepten zijn er?"], truth: (s) => s.recipes.filter((r) => r.tags.includes("snel")).map((r) => r.title).join(", ") },
  { id: "risotto-ing", cat: "recipes", turns: ["Wat heb ik nodig voor de pittige risotto?"], truth: (s) => ing(recipe(s, "risotto")) },
  { id: "zurkel-method", cat: "recipes", turns: ["Hoe maak ik zurkelpuree?"], truth: (s) => { const r = recipe(s, "zurkelpuree"); return `ingrediënten: ${ing(r)}\nbereiding: ${r.method ?? "(geen bereiding ingevuld)"}\nnotities: ${r.notes ?? "-"}`; } },
  { id: "vleesje-recipes", cat: "recipes", turns: ["Bij welke recepten kies je zelf een vleesje?"], truth: (s) => s.recipes.filter((r) => r.has_vleesje || /\[vleesje\]/i.test(r.title)).map((r) => r.title).join(", ") },
  { id: "quiches", cat: "recipes", turns: ["Welke quiches hebben we?"], truth: (s) => s.recipes.filter((r) => r.tags.includes("quiche") || /quiche/i.test(r.title)).map((r) => r.title).join(", ") },
  { id: "recipe-count", cat: "recipes", turns: ["Hoeveel recepten staan er in de app?"], truth: (s) => String(s.recipes.length) },
  { id: "no-fresh", cat: "recipes", turns: ["Welke recepten kan ik maken zonder verse groenten?"], truth: (s) => `Tag "Geen verse groenten nodig" (diepvriesgroenten): ${s.recipes.filter((r) => r.tags.includes("diepvriesgroenten")).map((r) => r.title).join(", ")}` },
  { id: "courgette", cat: "recipes", turns: ["In welke recepten zit courgette?"], truth: (s) => s.recipes.filter((r) => r.ingredients.some((i: any) => /courgette/i.test(i.name))).map((r) => r.title).join(", ") },
  { id: "winter-pasta", cat: "recipes", turns: ["Geef me pastarecepten die passen in de winter."], truth: (s) => s.recipes.filter((r) => r.tags.includes("pasta") && r.tags.includes("winter")).map((r) => r.title).join(", ") + "\n(een deel ervan noemen is ok als alles klopt)" },
  // freezer
  { id: "potjes-count", cat: "freezer", turns: ["Hoeveel potjes zitten er nu in de diepvries?"], truth: (s) => potjesNow(s) },
  { id: "amber-potjes", cat: "freezer", turns: ["Welke potjes heeft Amber nog in de diepvries?"], truth: (s) => potjesNow(s, "amber") },
  { id: "hamburgers", cat: "freezer", turns: ["Hoeveel hamburgers liggen er nog in de diepvries?"], truth: (s) => s.vleesjes.filter((v) => /hamburger/i.test(v.name)).map(stockLine).join("\n") },
  { id: "free-vlees", cat: "freezer", turns: ["Welke vleesjes zijn er nog vrij in de diepvries (niet gereserveerd)?"], truth: (s) => s.vleesjes.filter((v) => v.amount - v.reserved.reduce((a: number, r: any) => a + r.amount, 0) > 0).map((v) => `${v.name}: ${v.amount - v.reserved.reduce((a: number, r: any) => a + r.amount, 0)} vrij`).join("\n") },
  { id: "groenten", cat: "freezer", turns: ["Welke groenten liggen er in de diepvries?"], truth: (s) => s.groenten.map(stockLine).join("\n") },
  { id: "krokante-kip", cat: "freezer", turns: ["Hebben we nog krokante kip?"], truth: (s) => s.vleesjes.filter((v) => /krokant/i.test(v.name)).map(stockLine).join("\n") },
  { id: "schnitzel-for", cat: "freezer", turns: ["Voor welke maaltijd is de schnitzel uit de diepvries gereserveerd?"], truth: (s) => s.vleesjes.filter((v) => /schnitzel/i.test(v.name)).map(stockLine).join("\n") + "\n" + s.meals.filter((m) => m.date >= TODAY && JSON.stringify(m.vleesjes).toLowerCase().includes("schnitzel")).map((m) => `${m.date} ${m.title} (${m.who})`).join("\n") },
  { id: "shortages", cat: "freezer", turns: ["Komen we iets tekort in de diepvries voor wat er gepland is?"], truth: (s) => { const out: string[] = []; for (const m of s.meals.filter((m) => m.date >= TODAY)) for (const v of m.vleesjes.filter((v: any) => v.source === "freezer")) { const st = s.vleesjes.filter((e) => e.name.toLowerCase() === v.name.toLowerCase().trim()); const reserved = st.flatMap((e) => e.reserved).filter((r: any) => r.day === m.date).reduce((a: number, r: any) => a + r.amount, 0); if (reserved < v.count) out.push(`${m.date} ${m.title}: wil ${v.count} ${v.name}, gereserveerd ${reserved}`); } return out.join("\n") || "geen tekorten"; } },
  // shopping
  { id: "shopping", cat: "shopping", turns: ["Wat staat er op de boodschappenlijst?"], truth: (s) => `zelf toegevoegd: ${JSON.stringify(s.shop?.content)?.match(/"text":"[^"]+"/g)?.join(", ")}\nuit planning: ${(s.shop?.generated_origins?.lines ?? []).map((l: any) => l.label).join(", ")}` },
  { id: "why-gehakt", cat: "shopping", turns: ["Waarom staat er gehakt op de boodschappenlijst?"], truth: (s) => (s.shop?.generated_origins?.lines ?? []).filter((l: any) => /gehakt/i.test(l.name)).map((l: any) => `${l.label}: ${l.origins.map((o: any) => `${o.meal} op ${o.date} (${o.amount})`).join(", ")}`).join("\n") },
  { id: "manual-shop", cat: "shopping", turns: ["Wat heb ik zelf op het boodschappenlijstje gezet?"], truth: (s) => JSON.stringify(s.shop?.content)?.match(/"text":"[^"]+"/g)?.join(", ") ?? "niets" },
  // settings
  { id: "tags", cat: "settings", turns: ["Welke tags bestaan er voor recepten?"], truth: (s) => s.tags.map((t) => t.label).join(", ") },
  { id: "robin-modes", cat: "settings", turns: ["Welke situaties kan ik voor Robin kiezen in de planning?"], truth: (s) => s.modes.filter((m) => m.who === "robin").map((m) => m.label).join(", ") + " (plus standaard: Thuis)" },
  // how the app works
  { id: "how-freezer", cat: "app", turns: ["Hoe werkt de diepvrieslijst in de app?"], truth: () => "Diepvries-pagina met tabs Potjes, Vleesjes en Groenten. Potjes = ingevroren porties per persoon (Robin/Amber), komen erbij door bij een maaltijd extra potjes te koken of met de hand; je eet ze op met een 'Potje diepvries'-maaltijd. Vleesjes en groenten zijn telbare voorraad; geplande maaltijden reserveren ze (oudste eerst) en ze worden pas afgeteld als de dag voorbij is; tekorten worden getoond." },
  { id: "how-plan-potje", cat: "app", turns: ["Hoe plan ik een potje uit de diepvries in voor een dag?"], truth: () => "In de planning bij een dag een maaltijd toevoegen als 'Potje diepvries' en een potje kiezen uit de lijst; Samen heeft van beide personen een potje van hetzelfde gerecht nodig; potjes die pas later klaar zijn of al ingepland zijn worden doorgestreept getoond." },
  { id: "how-shopping", cat: "app", turns: ["Hoe komt iets op de boodschappenlijst?"], truth: () => "Twee delen: wat je zelf typt (Zelf toegevoegd) blijft staan; het deel 'Uit je planning' wordt gemaakt uit de ingrediënten van geplande maaltijden van gekozen dagen, gegroepeerd per afdeling (AI kiest afdeling), en vervangen bij opnieuw genereren. Ingrediënten die niet op de lijst moeten of uit de diepvries komen staan er niet op." },
  { id: "how-vleesje", cat: "app", turns: ["Wat betekent het als een recept een vleesje heeft?"], truth: () => "Het recept heeft een open plek voor vlees ([vleesje]); bij het inplannen kies je welk vleesje (uit de diepvries of te kopen) en hoeveel; de titel toont dan bv. 'Bloemkool met 3 Hamburger'." },
  { id: "how-add-recipe", cat: "app", turns: ["Hoe voeg ik een nieuw recept toe?"], truth: () => "Op de Recepten-pagina via de knop om een recept toe te voegen; titel, tags, ingrediënten (met hoeveelheid/eenheid, per persoon of samen, al dan niet op de boodschappenlijst), of je zelf een vleesje kiest, bereiding, notities en een foto (opladen of link) invullen en opslaan. Extra correcte details uit de app zijn ok." },
  { id: "how-modes", cat: "app", turns: ["Wat zijn die situaties zoals 'tot 18u' boven elke dag?"], truth: () => "Per dag kan je voor Amber en Robin een situatie (dagmodus) kiezen, bv. werkuren of locatie; ze zijn zelf te beheren (toevoegen/hernoemen) en tonen hoe de dag eruitziet; zonder keuze is het 'Thuis'." },
  // data changes: propose (approval card), never "dat kan ik niet"
  { id: "chg-robin-gent", cat: "change-data", turns: ["verander Robin thuis eens naar robin gent"], truth: (s) => `Mag NIET zeggen dat het niet kan. Goed is: proposeChange met setSituation voor Robin naar de situatie met 'Gent' in het label (situaties Robin: ${s.modes.filter((m) => m.who === "robin").map((m) => m.label).join(", ")}) voor een redelijke dag (vandaag ${TODAY} of de dag waar Robin op Thuis staat), OF kort vragen voor welke dag(en).`, expectTool: "proposeChange" },
  { id: "chg-robin-mon", cat: "change-data", turns: ["Zet Robin maandag op Gent in plaats van thuis."], truth: (s) => `proposeChange met setSituation date ${NEXT_MON} who Robin en situatie = het label met 'Gent' (${s.modes.filter((m) => m.who === "robin").map((m) => m.label).join(", ")}). Antwoord bevestigt kort.`, expectTool: "proposeChange" },
  { id: "chg-delete", cat: "change-data", turns: ["Verwijder de maaltijd van morgen uit de planning."], truth: (s) => `Morgen: ${fmtDay(day(s, addIsoDays(TODAY, 1)))}. Goed: proposeChange met deleteMeal (userAskedToDelete true) voor die maaltijd op ${addIsoDays(TODAY, 1)}; als er geen maaltijd is, dat zeggen zonder voorstel.`, expectTool: "proposeChange" },
  { id: "chg-hamburgers", cat: "change-data", turns: ["Zet 3 hamburgers bij in de diepvries."], truth: (s) => `Nu: ${s.vleesjes.filter((v) => /hamburger/i.test(v.name)).map(stockLine).join("; ") || "geen hamburgers"}. Goed: proposeChange met addVleesje {name hamburger(s), count 3} of setVleesjeCount op huidig+3. Geen delete-op.`, expectTool: "proposeChange" },
  { id: "chg-shop", cat: "change-data", turns: ["Zet melk en eieren op de boodschappenlijst."], truth: () => "proposeChange met addShoppingItems [melk, eieren]. Geen delete-op.", expectTool: "proposeChange" },
  { id: "chg-move", cat: "change-data", turns: ["Schuif de maaltijd van morgen een dag op."], truth: (s) => `Morgen: ${fmtDay(day(s, addIsoDays(TODAY, 1)))}. Goed: proposeChange met moveMeal van ${addIsoDays(TODAY, 1)} naar ${addIsoDays(TODAY, 2)} (geen deleteMeal). Geen maaltijd morgen: dat zeggen.`, expectTool: "proposeChange" },
  { id: "chg-no-delete", cat: "change-data", turns: ["Ik heb geen zin meer in de maaltijd van morgen."], truth: () => "Mag NIET zomaar een delete voorstellen (gebruiker vroeg niet uitdrukkelijk om te verwijderen). Goed: vragen wat ze wil (ander recept, verplaatsen, verwijderen) of een alternatief voorstellen; een proposeChange zonder delete-op is ook ok.", expectTool: "none" },
  // app change: proposal card
  { id: "change-code", cat: "change", turns: ["Kan de knop om een recept toe te voegen groen worden?"], truth: () => "proposeCodeChange met een duidelijke beschrijving (knop recept toevoegen groen). Antwoord zegt kort dat het een voorstel is om goed te keuren / dat het gestart is.", expectTool: "proposeCodeChange" },
  // multi-turn
  { id: "mt-tomorrow-ing", cat: "multi", turns: ["Wat eten we morgen?", "En wat heb ik daarvoor nodig?"], truth: (s) => { const d = day(s, addIsoDays(TODAY, 1)); const r = d?.meals[0] ? recipe(s, d.meals[0].title.split(" met ")[0]) : null; return `${fmtDay(d)}\ningrediënten: ${r ? ing(r) : "?"}`; } },
  { id: "mt-kipfilet", cat: "multi", turns: ["Hebben we nog kipfilet in de diepvries?", "Is die al ergens voor ingepland?"], truth: (s) => s.vleesjes.filter((v) => /kipfilet/i.test(v.name)).map(stockLine).join("\n") || "geen kipfilet" },
  { id: "mt-ravioli", cat: "multi", turns: ["Wanneer aten we laatst ravioli?", "En wanneer staat het weer gepland?"], truth: (s) => mealsMatching(s, "ravioli").map((m) => `${m.date} (${m.who}${m.fromFreezer ? ", potje" : ""})`).join("\n") + `\nvandaag is ${TODAY}` },
  { id: "mt-recipe-tags", cat: "multi", turns: ["Zoek een recept met spinazie.", "Welke tags heeft het eerste recept dat je noemde?"], truth: (s) => s.recipes.filter((r) => /spinazie/i.test(r.title) || r.ingredients.some((i: any) => /spinazie/i.test(i.name))).map((r) => `${r.title}: ${r.tags.map((t: string) => s.tags.find((x) => x.value === t)?.label ?? t).join(", ")}`).join("\n") },
];

// ---------- run ----------
type ToolCallLog = { name: string; ms: number; bytes: number; input: unknown };
async function runQuestion(q: Q, s: Snap) {
  const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });
  const calls: ToolCallLog[] = [];
  const base = buildChatTools("eval@local") as Record<string, any>;
  const tools: Record<string, any> = {};
  for (const [name, t] of Object.entries(base)) {
    if (name === "proposeChange" || name === "proposeCodeChange") {
      // Stub: the user "approves", nothing is applied or dispatched.
      tools[name] = tool({
        description: t.description,
        inputSchema: t.inputSchema,
        execute: async (input: any) => {
          calls.push({ name, ms: 0, bytes: 0, input });
          return name === "proposeChange"
            ? { ok: true, summary: "Gedaan.", undoId: "00000000-0000-0000-0000-000000000000" }
            : { runId: "00000000-0000-0000-0000-000000000000" };
        },
      });
      continue;
    }
    tools[name] = {
      ...t,
      execute: async (input: any, opts: any) => {
        const t0 = performance.now();
        const out = await t.execute(input, opts);
        calls.push({ name, ms: Math.round(performance.now() - t0), bytes: JSON.stringify(out ?? null).length, input });
        return out;
      },
    };
  }
  const messages: ModelMessage[] = [];
  const answers: string[] = [];
  let steps = 0;
  const t0 = performance.now();
  for (const turn of q.turns) {
    messages.push({ role: "user", content: turn });
    const r = streamText({
      model: openrouter.chat(MODEL),
      system: systemPrompt(TODAY),
      messages,
      tools,
      stopWhen: stepCountIs(8),
    });
    await r.consumeStream();
    const st = await r.steps;
    steps += st.filter((x) => x.toolCalls.length > 0).length;
    answers.push(await r.text);
    messages.push(...(await r.response).messages);
  }
  const totalMs = Math.round(performance.now() - t0);
  return { calls, answers, steps, totalMs };
}

async function judge(q: Q, truth: string, answers: string[], calls: ToolCallLog[]) {
  const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });
  const proposals = calls.filter((c) => c.name.startsWith("propose"));
  const toolNote = q.expectTool
    ? `Voorstellen (goedgekeurd door de gebruiker in de test, niets echt uitgevoerd): ${proposals.length ? proposals.map((c) => `${c.name} ${JSON.stringify(c.input)}`).join("\n") : "geen"}`
    : proposals.length ? `FOUT: de bot deed een wijzigingsvoorstel terwijl de vraag alleen om informatie vroeg: ${proposals.map((c) => c.name).join(", ")}` : "";
  const { text } = await generateText({
    model: openrouter.chat(JUDGE),
    temperature: 0,
    maxOutputTokens: 900,
    prompt: `Je beoordeelt een chatbot van een maaltijdplanner-app. Vandaag is ${WD[dow(TODAY)]} ${TODAY}.
Kalender (juist, gebruik deze en reken zelf geen weekdagen uit): ${CAL}.
Datums zonder jaar in het antwoord slaan op het juiste jaar; dat is geen fout. Weekdagen in het antwoord komen van de app: tel ze alleen fout als ze tegen de kalender hierboven ingaan.
Vraag(en) van de gebruiker, in volgorde:
${q.turns.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Antwoord(en) van de bot:
${answers.map((a, i) => `--- antwoord ${i + 1} ---\n${a}`).join("\n")}

Waarheid uit de database / verwacht gedrag:
${truth}
${toolNote}

Is het (laatste) antwoord correct? Correct = de kernfeiten kloppen met de waarheid, geen verzonnen of foute feiten, geen belangrijke ontbrekende feiten die de vraag rechtstreeks vraagt. Kleine formuleringsverschillen, extra correcte context en het weglaten van details waar de vraag niet om vraagt zijn ok. Een antwoord dat zegt dat het iets niet kan vinden terwijl de waarheid het bevat, is fout.
Denk kort na (max 5 zinnen) en eindig met precies één regel JSON: {"pass": true|false, "reason": "<kort>"}`,
  });
  try {
    const last = text.slice(text.lastIndexOf('{"pass"'));
    const j = JSON.parse(last.slice(0, last.lastIndexOf("}") + 1));
    return { pass: !!j.pass, reason: String(j.reason ?? "") };
  } catch {
    const m = [...text.matchAll(/"pass"\s*:\s*(true|false)/g)].pop();
    return { pass: m?.[1] === "true", reason: `(raw) ${text.slice(0, 300)}` };
  }
}

async function main() {
  const s = await snapshot();
  const qs = Qs.filter((q) => !ONLY || ONLY.includes(q.id));
  const results: any[] = [];
  let next = 0;
  async function worker() {
    while (next < qs.length) {
      const q = qs[next++];
      const truth = q.truth(s);
      try {
        const r = await runQuestion(q, s);
        const j = await judge(q, truth, r.answers, r.calls);
        const maxToolMs = Math.max(0, ...r.calls.map((c) => c.ms));
        results.push({ id: q.id, cat: q.cat, turns: q.turns, truth, ...r, ...j, maxToolMs });
        console.log(`${j.pass ? "PASS" : "FAIL"} ${q.id.padEnd(16)} steps=${r.steps} tools=${r.calls.map((c) => `${c.name}:${c.ms}ms`).join(",")} total=${r.totalMs}ms ${j.pass ? "" : "| " + j.reason}`);
      } catch (e: any) {
        results.push({ id: q.id, cat: q.cat, turns: q.turns, truth, error: String(e?.message ?? e), pass: false, steps: 0, calls: [] });
        console.log(`ERR  ${q.id} ${e?.message ?? e}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  results.sort((a, b) => qs.findIndex((q) => q.id === a.id) - qs.findIndex((q) => q.id === b.id));
  const n = results.length;
  const pass = results.filter((r) => r.pass).length;
  const within3 = results.filter((r) => r.pass && r.steps <= 3).length;
  const allMs = results.flatMap((r) => r.calls.filter((c: ToolCallLog) => !c.name.startsWith("propose")).map((c: ToolCallLog) => c.ms)).sort((a, b) => a - b);
  const pct = (p: number) => allMs[Math.min(allMs.length - 1, Math.floor(p * allMs.length))] ?? 0;
  const summary = {
    label: LABEL, today: TODAY, model: MODEL, judge: JUDGE, questions: n, pass, passPct: Math.round((pass / n) * 1000) / 10,
    passWithin3Steps: within3, passWithin3Pct: Math.round((within3 / n) * 1000) / 10,
    avgSteps: Math.round((results.reduce((a, r) => a + r.steps, 0) / n) * 100) / 100,
    toolCalls: allMs.length, toolMsP50: pct(0.5), toolMsP95: pct(0.95), toolMsMax: allMs[allMs.length - 1] ?? 0,
    over300ms: allMs.filter((m) => m >= 300).length,
    writeAttempts,
  };
  console.log(JSON.stringify(summary, null, 2));
  mkdirSync("docs/eval", { recursive: true });
  writeFileSync(`docs/eval/${LABEL}.json`, JSON.stringify({ summary, results }, null, 2));
  process.exit(writeAttempts.length ? 2 : 0);
}
main();
