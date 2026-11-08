// Runs approved chat ops through the app's own server actions, so every rule
// the screens enforce (freezer reservations, potjes, buy lines) holds here too.
// Names from the chat are resolved to rows first; anything ambiguous or
// unknown throws a plain Dutch error (the caller then rolls everything back).
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDayLabel } from "@/lib/date";
import type { Op } from "@/lib/chat/ops";
import type { Assignee, IngredientRow, TemplateVleesje } from "@/lib/types";
import { resolveTitle } from "@/app/(protected)/planning/config";
import { normalizeRecipeImageUrl } from "@/lib/recipes/images";
import { todayIso } from "@/lib/date";
import { listPortions } from "@/lib/data";
import { potjeBlockReason, potjeChoices, type Who } from "@/lib/freezer/potjes";
import {
  assignRecipe,
  deleteMeal,
  extendDays,
  moveMeal,
  planPotje,
  setDayNote,
  setMealFreezer,
  setMealGroenten,
  setMealVleesjes,
  setMode,
} from "@/app/(protected)/planning/actions";
import { createMode, deleteMode, updateMode } from "@/app/(protected)/planning/mode-actions";
import { createVleesje, deleteVleesje, setVleesjeCount } from "@/app/(protected)/vleesjes/actions";
import { createGroente, deleteGroente, updateGroente } from "@/app/(protected)/diepvries/actions";
import { adjustPotje, createPotje, deletePotje } from "@/app/(protected)/potjes/actions";
import { createRecipe, updateRecipe, type RecipeInput } from "@/app/(protected)/recepten/actions";
import { createTag, deleteTag, updateTag } from "@/app/(protected)/recepten/tag-actions";
import { createCategory, deleteCategory, recomputeCategories, renameCategory, setIngredientCategory } from "@/app/(protected)/boodschappenlijstje/category-actions";
import { generateShoppingList, saveShoppingDoc } from "@/app/(protected)/boodschappenlijstje/actions";
import { revalidatePath } from "next/cache";

const BOX: Record<string, Assignee> = { Samen: "both", Amber: "amber", Robin: "robin" };
/** Words that mean "any potje will do". */
const ANY_POTJE = new Set(["willekeurig", "random", "eender welk", "maakt niet uit", "maakt niet uit welk", "om het even", "gewoon een potje", "een potje"]);
const WHO = { Amber: "amber", Robin: "robin" } as const;
const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`´]/g, "'")
    .toLowerCase()
    .trim();

/** One unique match: exact name first, then the only one containing it. */
function pick<T>(rows: T[], key: (r: T) => string, q: string, what: string): T {
  const n = norm(q);
  const exact = rows.filter((r) => norm(key(r)) === n);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return exact[0];
  const part = rows.filter((r) => norm(key(r)).includes(n) || (n.includes(norm(key(r))) && norm(key(r)).length > 2));
  if (part.length === 1) return part[0];
  if (!part.length) throw new Error(`${what} “${q}” niet gevonden.`);
  throw new Error(`${what} “${q}” is niet eenduidig: ${part.slice(0, 5).map(key).join(", ")}.`);
}

async function rows<T = any>(q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function findMeal(db: SupabaseClient, date: string, meal: string, who?: string) {
  const day = (await rows(db.from("plan_days").select("id").eq("day_date", date)))[0];
  if (!day) throw new Error(`Er staat niets gepland op ${formatDayLabel(date)}.`);
  let meals = await rows<any>(
    db.from("plan_meals").select("id, assignee, freeform_title, raw_text, template_vleesjes, recipe:recipes(title)").eq("plan_day_id", day.id),
  );
  if (who) meals = meals.filter((m) => m.assignee === BOX[who]);
  const title = (m: any) => resolveTitle(m.recipe?.title ?? m.freeform_title ?? m.raw_text ?? "", m.template_vleesjes);
  const n = norm(meal);
  const hits = meals.filter((m) => norm(title(m)).includes(n) || norm(m.recipe?.title).includes(n) || n.includes(norm(m.recipe?.title ?? m.freeform_title ?? "~")));
  if (!hits.length) throw new Error(`Geen maaltijd “${meal}”${who ? ` voor ${who}` : ""} op ${formatDayLabel(date)}.`);
  if (hits.length > 1) throw new Error(`Op ${formatDayLabel(date)} zijn er meerdere maaltijden “${meal}”: zeg voor wie (Samen, Amber of Robin).`);
  const m = hits[0];
  const baseTitle = resolveTitle(m.recipe?.title ?? m.freeform_title ?? m.raw_text ?? "", null);
  return { id: m.id as string, assignee: m.assignee as Assignee, title: title(m), baseTitle, vleesjes: (m.template_vleesjes ?? []) as TemplateVleesje[] };
}

/** Freezer stock entries (kind: vleesjes or groenten with amount > 0), name and unit as the tabs show them. */
async function stockEntries(db: SupabaseClient, table: "vleesjes" | "groenten"): Promise<{ name: string; unit: string }[]> {
  const col = table === "vleesjes" ? "count" : "amount";
  const all = await rows<any>(db.from(table).select(table === "vleesjes" ? "name, count" : "name, unit, amount"));
  return all.filter((r) => Number(r[col]) > 0).map((r) => ({ name: String(r.name).trim(), unit: table === "vleesjes" ? "" : String(r.unit ?? "").trim() }));
}

/** The freezer entry a chat name means: exact name first, then the one entry containing it. */
function stockName(entries: { name: string; unit: string }[], q: string, what: string): string {
  const names = [...new Map(entries.map((e) => [norm(e.name), e.name])).values()];
  const n = norm(q);
  const exact = names.filter((x) => norm(x) === n);
  const part = names.filter((x) => norm(x).includes(n) || (norm(x).length > 2 && n.includes(norm(x))));
  const hit = exact.length ? exact : part;
  if (hit.length === 1) return hit[0];
  if (!hit.length) throw new Error(`${what} “${q}” staat niet in de diepvries. Er is: ${names.slice(0, 12).join(", ") || "niets"}.`);
  throw new Error(`${what} “${q}” is niet eenduidig: ${hit.slice(0, 5).join(", ")}.`);
}

/** Groente name + unit as the freezer entry has them, so the reservation lands on the real batch. */
function stockGroente(entries: { name: string; unit: string }[], name: string, unit: string): { name: string; unit: string } {
  const real = stockName(entries, name, "Groente");
  const units = [...new Set(entries.filter((e) => norm(e.name) === norm(real)).map((e) => e.unit))];
  const same = units.find((u) => norm(u) === norm(unit));
  if (same !== undefined) return { name: real, unit: same };
  if (units.length === 1) return { name: real, unit: units[0] };
  throw new Error(`${real} staat in de diepvries in ${units.join(" en ")}, niet in ${unit}. Kies een van die eenheden.`);
}

async function recipeByTitle(db: SupabaseClient, q: string) {
  return pick(await rows<any>(db.from("recipes").select("*, ingredients(*)")), (r) => r.title, q, "Recept");
}

async function tagValues(db: SupabaseClient, labels: string[]): Promise<string[]> {
  const tags = await rows<any>(db.from("recipe_tags").select("value, label"));
  return labels.map((l) => {
    const t = tags.find((x) => norm(x.label) === norm(l) || norm(x.value) === norm(l));
    if (!t) throw new Error(`Tag “${l}” bestaat niet. Maak hem eerst aan.`);
    return t.value as string;
  });
}

type IngredientIn = { name: string; amount?: number; unit?: string; perPerson?: { Robin?: number; Amber?: number }; onShoppingList?: boolean };
/** Same storage as the recipe editor: a Samen amount is stored per serving (÷2). */
function ingredientRow(i: IngredientIn, sort: number): IngredientRow {
  const pp: Record<string, number> = {};
  if (i.perPerson?.Robin != null) pp.robin = i.perPerson.Robin;
  if (i.perPerson?.Amber != null) pp.amber = i.perPerson.Amber;
  const perPerson = Object.keys(pp).length > 0;
  return {
    name: i.name.trim(),
    unit: (i.unit ?? "").trim(),
    scaling: perPerson ? "per_person" : "per_serving",
    amount: perPerson || i.amount == null ? null : i.amount / 2,
    amount_max: null,
    amounts_per_person: perPerson ? pp : {},
    is_fresh: false,
    include_in_shopping: i.onShoppingList ?? true,
    sort,
  };
}
function toIngredientRow(r: any): IngredientRow {
  const { id: _id, recipe_id: _rid, ...rest } = r;
  return rest as IngredientRow;
}

// ---- shopping documents (TipTap JSON) ----
type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string };
const nodeText = (n: Node): string => (n.text ?? "") + (n.content ?? []).map(nodeText).join("");
function taskItem(text: string): Node {
  return { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}
/** Visit every task item; `fn` returns false to drop it. Returns how many matched. */
function eachItem(doc: Node | null, items: string[], fn: (n: Node) => boolean): number {
  if (!doc) return 0;
  let hits = 0;
  const walk = (n: Node) => {
    if (!n.content) return;
    n.content = n.content.filter((c) => {
      if (c.type === "taskItem" || c.type === "listItem") {
        const t = norm(nodeText(c));
        if (t && items.some((i) => t.includes(norm(i)))) {
          hits++;
          return fn(c);
        }
      }
      walk(c);
      return true;
    });
  };
  walk(doc);
  return hits;
}

async function shoppingDocs(db: SupabaseClient): Promise<{ manual: Node | null; generated: Node | null }> {
  const r = (await rows<any>(db.from("shopping_doc").select("content, generated_content").order("id").limit(1)))[0];
  return { manual: (r?.content as Node) ?? null, generated: (r?.generated_content as Node) ?? null };
}

/** Run one op. Returns one line for the summary. */
export async function runOp(db: SupabaseClient, op: Op): Promise<string> {
  switch (op.op) {
    case "setSituation": {
      const who = WHO[op.who];
      if (norm(op.situation) === "thuis") {
        await setMode(op.date, who, null);
        return `${op.who} op ${formatDayLabel(op.date)}: Thuis`;
      }
      const modes = await rows<any>(db.from("plan_modes").select("value, label").eq("who", who));
      const m = pick(modes, (x) => x.label, op.situation, `Situatie voor ${op.who}`);
      await setMode(op.date, who, m.value);
      return `${op.who} op ${formatDayLabel(op.date)}: ${m.label}`;
    }
    case "setDayNote":
      await setDayNote(op.date, op.note);
      return op.note.trim() ? `Notitie op ${formatDayLabel(op.date)}: “${op.note.trim()}”` : `Notitie op ${formatDayLabel(op.date)} gewist`;
    case "addMeal": {
      const r = await recipeByTitle(db, op.recipe);
      await assignRecipe(op.date, BOX[op.who], r.id);
      return `${r.title} gepland op ${formatDayLabel(op.date)} (${op.who})`;
    }
    case "addPotjeMeal": {
      const box = BOX[op.who];
      const portions = await listPortions();
      const today = todayIso();
      const choices = potjeChoices(portions, op.date, box === "both" ? "both" : (box as Who), today);
      const anyPotje = !op.potje || ANY_POTJE.has(norm(op.potje));
      let name = op.potje ?? "";
      if (anyPotje) {
        // Choices are sorted: dishes already in the freezer first.
        if (!choices.length) throw new Error(`Er is geen vrij potje voor ${op.who} op ${formatDayLabel(op.date)}.`);
        name = choices[0].name;
      } else {
        // "hamrolletjes" for "Hamrolletjes met witloof": take the one free dish that contains it.
        const part = choices.filter((c) => norm(c.name).includes(norm(name)));
        if (!choices.some((c) => norm(c.name) === norm(name)) && part.length === 1) name = part[0].name;
        const reason = potjeBlockReason(portions, name, op.date, box === "both" ? "both" : (box as Who), today, undefined, formatDayLabel);
        if (reason) {
          const fits = choices.map((c) => c.name).slice(0, 5);
          throw new Error(`${reason}${fits.length ? ` Voor ${op.who} op ${formatDayLabel(op.date)} kan: ${fits.join(", ")}.` : ` Voor ${op.who} op ${formatDayLabel(op.date)} is er geen vrij potje.`}`);
        }
        name = choices.find((c) => norm(c.name) === norm(name))?.name ?? name;
      }
      await planPotje(op.date, box, name);
      return `Potje ${name} gepland op ${formatDayLabel(op.date)} (${op.who})`;
    }
    case "moveMeal": {
      const m = await findMeal(db, op.date, op.meal, op.who);
      await moveMeal(m.id, op.toDate, op.toWho ? BOX[op.toWho] : m.assignee);
      return `${m.title} verplaatst naar ${formatDayLabel(op.toDate)}${op.toWho ? ` (${op.toWho})` : ""}`;
    }
    case "setMealVleesjes": {
      const m = await findMeal(db, op.date, op.meal, op.who);
      // Freezer lines name a real freezer entry ("kip" -> "Krokante kip"); buy lines are free text.
      const entries = op.vleesjes.some((v) => v.source === "diepvries") ? await stockEntries(db, "vleesjes") : [];
      const asked: TemplateVleesje[] = op.vleesjes.map((v) => ({
        name: v.source === "diepvries" ? stockName(entries, v.name, "Vleesje") : v.name.trim(),
        count: v.count,
        source: v.source === "kopen" ? "buy" : "freezer",
      }));
      // Default "add": keep what the meal already has; the same vleesje and source adds up.
      const lines: TemplateVleesje[] = op.mode === "replace" ? [] : m.vleesjes.map((v) => ({ ...v }));
      for (const a of asked) {
        const same = lines.find((l) => norm(l.name) === norm(a.name) && l.source === a.source);
        if (same) same.count = Math.min(99, same.count + a.count);
        else lines.push(a);
      }
      await setMealVleesjes(m.id, lines);
      const list = lines.map((v) => `${v.count} ${v.name} (${v.source === "buy" ? "kopen" : "diepvries"})`).join(", ") || "geen";
      return `${m.baseTitle} ${formatDayLabel(op.date)}: ${list}`;
    }
    case "setMealGroenten": {
      const m = await findMeal(db, op.date, op.meal, op.who);
      const entries = op.groenten.length ? await stockEntries(db, "groenten") : [];
      const lines = op.groenten.map((g) => {
        const real = stockGroente(entries, g.name, g.unit);
        return { name: real.name, unit: real.unit, amount: g.amount, replaces: g.replaces ?? null };
      });
      await setMealGroenten(m.id, lines);
      return `Diepvriesgroenten bij ${m.baseTitle}: ${lines.map((g) => `${g.amount} ${g.unit} ${g.name}`).join(", ") || "geen"}`;
    }
    case "setExtraPotjes": {
      const m = await findMeal(db, op.date, op.meal, op.who);
      await setMealFreezer(m.id, op.robin, op.amber);
      return `Extra potjes bij ${m.title}: Robin ${op.robin}, Amber ${op.amber}`;
    }
    case "extendPlanning":
      await extendDays(op.days);
      return `Planning ${op.days} dagen verlengd`;
    case "deleteMeal": {
      const m = await findMeal(db, op.date, op.meal, op.who);
      await deleteMeal(m.id);
      return `${m.title} verwijderd van ${formatDayLabel(op.date)}`;
    }
    case "addVleesje":
      await createVleesje(op.name, op.count);
      return `${op.count} ${op.name} in de diepvries gezet`;
    case "setVleesjeCount": {
      // Several batches may share a name: change the newest first, keep the oldest.
      const all = await rows<any>(db.from("vleesjes").select("id, name, count, created_at").order("created_at", { ascending: false }));
      const name = pick([...new Map(all.map((v) => [norm(v.name), v])).values()], (v) => v.name, op.name, "Vleesje").name;
      const batches = all.filter((v) => norm(v.name) === norm(name));
      let delta = op.count - batches.reduce((s, b) => s + b.count, 0);
      for (const b of batches) {
        if (delta === 0) break;
        const next = Math.max(0, Math.min(99, b.count + delta));
        delta -= next - b.count;
        await setVleesjeCount(b.id, next);
      }
      return `${name}: nu ${op.count} in de diepvries`;
    }
    case "deleteVleesje": {
      const all = await rows<any>(db.from("vleesjes").select("id, name"));
      const name = pick([...new Map(all.map((v) => [norm(v.name), v])).values()], (v) => v.name, op.name, "Vleesje").name;
      for (const b of all.filter((v) => norm(v.name) === norm(name))) await deleteVleesje(b.id);
      return `${name} uit de diepvries verwijderd`;
    }
    case "addGroente":
      await createGroente(op.name, op.amount, op.unit);
      return `${op.amount} ${op.unit} ${op.name} in de diepvries gezet`;
    case "updateGroente": {
      const g = pick(await rows<any>(db.from("groenten").select("id, name, amount, unit")), (x) => x.name, op.name, "Groente");
      await updateGroente(g.id, op.newName ?? g.name, op.amount ?? Number(g.amount), op.unit ?? g.unit);
      return `${g.name}: ${op.amount ?? g.amount} ${op.unit ?? g.unit}${op.newName ? `, heet nu ${op.newName}` : ""}`;
    }
    case "deleteGroente": {
      const g = pick(await rows<any>(db.from("groenten").select("id, name")), (x) => x.name, op.name, "Groente");
      await deleteGroente(g.id);
      return `${g.name} uit de diepvries verwijderd`;
    }
    case "addPotjes":
      if (op.robin + op.amber === 0) throw new Error("Geef minstens één potje op.");
      await createPotje(op.name, op.robin, op.amber);
      return `Potjes ${op.name} ingevroren: Robin ${op.robin}, Amber ${op.amber}`;
    case "changePotjes": {
      const who = WHO[op.who];
      for (let i = 0; i < Math.abs(op.delta); i++) await adjustPotje(op.name, who, op.delta > 0 ? 1 : -1);
      return `Potjes ${op.name} voor ${op.who}: ${op.delta > 0 ? "+" : ""}${op.delta}`;
    }
    case "deletePotjes": {
      const kept = await deletePotje(op.name);
      return `Potjes ${op.name} verwijderd${kept ? ` (${kept} ingeplande bleven staan)` : ""}`;
    }
    case "createRecipe": {
      const input: RecipeInput = {
        title: op.title,
        tags: await tagValues(db, op.tags ?? []),
        method: op.method?.trim() || null,
        notes: op.notes?.trim() || null,
        has_vleesje: op.hasVleesje ?? false,
        ingredients: (op.ingredients ?? []).map(ingredientRow),
      };
      await createRecipe(input);
      return `Recept ${op.title} aangemaakt`;
    }
    case "updateRecipe": {
      const r = await recipeByTitle(db, op.recipe);
      let ingredients: IngredientRow[] = [...r.ingredients].sort((a: any, b: any) => a.sort - b.sort).map(toIngredientRow);
      for (const name of op.removeIngredients ?? []) {
        const hit = pick(ingredients, (i) => i.name, name, `Ingrediënt in ${r.title}`);
        ingredients = ingredients.filter((i) => i !== hit);
      }
      for (const u of op.updateIngredients ?? []) {
        const hit = pick(ingredients, (i) => i.name, u.name, `Ingrediënt in ${r.title}`);
        const next = ingredientRow({ ...u, name: hit.name, unit: u.unit ?? hit.unit, onShoppingList: u.onShoppingList ?? hit.include_in_shopping }, hit.sort);
        ingredients = ingredients.map((i) => (i === hit ? next : i));
      }
      for (const a of op.addIngredients ?? []) ingredients.push(ingredientRow(a, ingredients.length));
      const input: RecipeInput = {
        title: op.title ?? r.title,
        tags: op.tags ? await tagValues(db, op.tags) : r.tags,
        method: op.method !== undefined ? op.method.trim() || null : r.method,
        notes: op.notes !== undefined ? op.notes.trim() || null : r.notes,
        has_vleesje: op.hasVleesje ?? r.has_vleesje,
        ingredients: ingredients.map((i, k) => ({ ...i, sort: k })),
      };
      await updateRecipe(r.id, input);
      return `Recept ${r.title} aangepast`;
    }
    case "deleteRecipe": {
      // Not the screen's deleteRecipe: that also removes the photo file, which
      // undo could not bring back. The row (and its ingredients) is journaled.
      const r = await recipeByTitle(db, op.recipe);
      const { error } = await db.from("recipes").delete().eq("id", r.id);
      if (error) throw new Error(error.message);
      revalidatePath("/recepten");
      revalidatePath("/planning");
      return `Recept ${r.title} verwijderd`;
    }
    case "setRecipeImage":
    case "clearRecipeImage": {
      // Only the row changes; the old photo file stays in storage so undo can
      // point back to it (the screen's actions delete the file).
      const r = await recipeByTitle(db, op.recipe);
      const url = op.op === "setRecipeImage" ? normalizeRecipeImageUrl(op.imageUrl) : null;
      if (op.op === "setRecipeImage" && !url) throw new Error("Dat is geen geldige afbeeldingslink (http of https).");
      const { error } = await db.from("recipes").update({ image_path: url, updated_at: new Date().toISOString() }).eq("id", r.id);
      if (error) throw new Error(error.message);
      revalidatePath("/recepten");
      return url ? `Foto van ${r.title} aangepast` : `Foto van ${r.title} weggehaald`;
    }
    case "recomputeShoppingSections":
      await recomputeCategories();
      return "Winkelsecties van de boodschappen opnieuw ingedeeld";
    case "createTag":
      await createTag(op.label);
      return `Tag ${op.label} aangemaakt`;
    case "renameTag": {
      const t = pick(await rows<any>(db.from("recipe_tags").select("id, label")), (x) => x.label, op.label, "Tag");
      await updateTag(t.id, op.newLabel);
      return `Tag ${t.label} heet nu ${op.newLabel}`;
    }
    case "deleteTag": {
      const t = pick(await rows<any>(db.from("recipe_tags").select("id, label")), (x) => x.label, op.label, "Tag");
      await deleteTag(t.id);
      return `Tag ${t.label} verwijderd`;
    }
    case "createSituation":
      await createMode(WHO[op.who], op.label);
      return `Situatie ${op.label} voor ${op.who} aangemaakt`;
    case "renameSituation": {
      const m = pick(await rows<any>(db.from("plan_modes").select("id, label").eq("who", WHO[op.who])), (x) => x.label, op.label, "Situatie");
      await updateMode(m.id, op.newLabel);
      return `Situatie ${m.label} heet nu ${op.newLabel}`;
    }
    case "deleteSituation": {
      const m = pick(await rows<any>(db.from("plan_modes").select("id, label").eq("who", WHO[op.who])), (x) => x.label, op.label, "Situatie");
      await deleteMode(m.id);
      return `Situatie ${m.label} van ${op.who} verwijderd`;
    }
    case "createShoppingSection":
      await createCategory(op.name);
      return `Winkelsectie ${op.name} aangemaakt`;
    case "renameShoppingSection": {
      const c = pick(await rows<any>(db.from("ingredient_categories").select("id, name")), (x) => x.name, op.name, "Winkelsectie");
      await renameCategory(c.id, op.newName);
      return `Winkelsectie ${c.name} heet nu ${op.newName}`;
    }
    case "deleteShoppingSection": {
      const c = pick(await rows<any>(db.from("ingredient_categories").select("id, name")), (x) => x.name, op.name, "Winkelsectie");
      await deleteCategory(c.id);
      return `Winkelsectie ${c.name} verwijderd`;
    }
    case "setIngredientSection": {
      const c = pick(await rows<any>(db.from("ingredient_categories").select("id, name")), (x) => x.name, op.section, "Winkelsectie");
      await setIngredientCategory(op.ingredient, c.id);
      return `${op.ingredient} staat nu onder ${c.name}`;
    }
    case "addShoppingItems": {
      const { manual } = await shoppingDocs(db);
      const doc: Node = manual && manual.type === "doc" ? manual : { type: "doc", content: [] };
      doc.content ??= [];
      const last = doc.content[doc.content.length - 1];
      const items = op.items.map((i) => taskItem(i.trim()));
      if (last?.type === "taskList") last.content = [...(last.content ?? []), ...items];
      else doc.content.push({ type: "taskList", content: items });
      await saveShoppingDoc("manual", doc);
      revalidatePath("/boodschappenlijstje");
      return `Op het boodschappenlijstje gezet: ${op.items.join(", ")}`;
    }
    case "checkShoppingItems":
    case "removeShoppingItems": {
      const docs = await shoppingDocs(db);
      const fn = (n: Node) => {
        if (op.op === "removeShoppingItems") return false;
        n.attrs = { ...(n.attrs ?? {}), checked: op.checked };
        return true;
      };
      const hm = eachItem(docs.manual, op.items, fn);
      const hg = eachItem(docs.generated, op.items, fn);
      if (!hm && !hg) throw new Error(`Niet gevonden op het boodschappenlijstje: ${op.items.join(", ")}.`);
      if (hm) await saveShoppingDoc("manual", docs.manual);
      if (hg) await saveShoppingDoc("generated", docs.generated);
      revalidatePath("/boodschappenlijstje");
      const verb = op.op === "removeShoppingItems" ? "verwijderd" : op.checked ? "afgevinkt" : "terug open gezet";
      return `${hm + hg} regel(s) ${verb}: ${op.items.join(", ")}`;
    }
    case "updateShoppingFromPlanning":
      await generateShoppingList([...new Set(op.dates)].sort());
      return `Boodschappen bijgewerkt voor ${op.dates.length} dag(en)`;
  }
}
