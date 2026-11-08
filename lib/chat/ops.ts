// Data changes the chat may PROPOSE. Schema only: nothing here writes.
// The user approves a proposal in the chat; the client then posts the ops to
// POST /api/chat/apply, which validates them again with this schema, journals
// every touched row (undo) and runs them through the app's own server actions.
//
// Ops name things the way the user sees them (dates, titles, names), never ids.
// Deleting is only possible through the delete* ops, and each one must carry
// userAskedToDelete: true (only when the user explicitly asked to delete).
import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "yyyy-MM-dd");
const name = z.string().trim().min(1).max(120);
const box = z.enum(["Samen", "Amber", "Robin"]);
const person = z.enum(["Amber", "Robin"]);
const text = z.string().max(4000);
const deleteFlag = z.literal(true).describe("Alleen true als de gebruiker uitdrukkelijk vroeg om te verwijderen");
/** Which meal on a day: (part of) its title, plus the box when the title alone is ambiguous. */
const mealRef = { date, meal: name.describe("(Deel van) de titel van de maaltijd op die dag"), who: box.optional() };

const ingredient = z.object({
  name,
  amount: z.number().nonnegative().optional().describe("Hoeveelheid voor Samen (Robin en Amber samen)"),
  unit: z.string().max(30).optional().describe("bv. gram, stuk, teen, dl, koffielepel"),
  perPerson: z.object({ Robin: z.number().nonnegative().optional(), Amber: z.number().nonnegative().optional() }).optional().describe("Eigen hoeveelheid per persoon, in plaats van amount"),
  onShoppingList: z.boolean().optional().describe("Standaard true"),
});

export const OpSchema = z.discriminatedUnion("op", [
  // planning
  z.object({ op: z.literal("setSituation"), date, who: person, situation: name.describe("Label van de situatie, of 'Thuis'") }),
  z.object({ op: z.literal("setDayNote"), date, note: text.describe("Lege tekst wist de notitie") }),
  z.object({ op: z.literal("addMeal"), date, who: box, recipe: name.describe("Titel van het recept") }),
  z.object({ op: z.literal("addPotjeMeal"), date, who: box, potje: name.optional().describe("Naam van het potje in de diepvries (uit getFreezer). Weglaten of 'willekeurig' als ze zegt: een random/eender welk potje; de app kiest dan zelf een vrij potje") }),
  z.object({ op: z.literal("moveMeal"), ...mealRef, toDate: date, toWho: box.optional() }),
  z.object({
    op: z.literal("setMealVleesjes"),
    ...mealRef,
    vleesjes: z.array(z.object({ name, count: z.number().int().min(1).max(99), source: z.enum(["diepvries", "kopen"]) })).max(10),
  }),
  z.object({
    op: z.literal("setMealGroenten"),
    ...mealRef,
    groenten: z.array(z.object({ name, amount: z.number().positive(), unit: z.string().max(30), replaces: z.string().max(120).optional() })).max(10),
  }),
  z.object({ op: z.literal("setExtraPotjes"), ...mealRef, robin: z.number().int().min(0).max(20), amber: z.number().int().min(0).max(20) }),
  z.object({ op: z.literal("extendPlanning"), days: z.number().int().min(1).max(60) }),
  z.object({ op: z.literal("deleteMeal"), ...mealRef, userAskedToDelete: deleteFlag }),
  // freezer
  z.object({ op: z.literal("addVleesje"), name, count: z.number().int().min(1).max(99) }),
  z.object({ op: z.literal("setVleesjeCount"), name, count: z.number().int().min(0).max(99).describe("Nieuw totaal in de diepvries") }),
  z.object({ op: z.literal("deleteVleesje"), name, userAskedToDelete: deleteFlag }),
  z.object({ op: z.literal("addGroente"), name, amount: z.number().positive(), unit: z.enum(["gram", "kilogram", "stuk", "portie", "zak", "doos", "verpakking"]) }),
  z.object({ op: z.literal("updateGroente"), name, newName: name.optional(), amount: z.number().nonnegative().optional(), unit: z.enum(["gram", "kilogram", "stuk", "portie", "zak", "doos", "verpakking"]).optional() }),
  z.object({ op: z.literal("deleteGroente"), name, userAskedToDelete: deleteFlag }),
  z.object({ op: z.literal("addPotjes"), name, robin: z.number().int().min(0).max(20), amber: z.number().int().min(0).max(20) }),
  z.object({ op: z.literal("changePotjes"), name, who: person, delta: z.number().int().min(-20).max(20).refine((n) => n !== 0, "niet 0") }),
  z.object({ op: z.literal("deletePotjes"), name, userAskedToDelete: deleteFlag }),
  // recipes
  z.object({
    op: z.literal("createRecipe"),
    title: name,
    tags: z.array(name).max(20).optional(),
    hasVleesje: z.boolean().optional(),
    method: text.optional(),
    notes: text.optional(),
    ingredients: z.array(ingredient).max(60).optional(),
  }),
  z.object({
    op: z.literal("updateRecipe"),
    recipe: name.describe("Huidige titel"),
    title: name.optional().describe("Nieuwe titel"),
    tags: z.array(name).max(20).optional().describe("Volledige nieuwe lijst tags"),
    hasVleesje: z.boolean().optional(),
    method: text.optional(),
    notes: text.optional(),
    addIngredients: z.array(ingredient).max(60).optional(),
    updateIngredients: z.array(ingredient).max(60).optional().describe("Bestaande ingrediënten (op naam) met nieuwe hoeveelheid/eenheid"),
    removeIngredients: z.array(name).max(60).optional(),
  }),
  z.object({ op: z.literal("deleteRecipe"), recipe: name, userAskedToDelete: deleteFlag }),
  z.object({ op: z.literal("setRecipeImage"), recipe: name, imageUrl: z.string().url().max(2000).describe("Link naar een foto (https)") }),
  z.object({ op: z.literal("clearRecipeImage"), recipe: name, userAskedToDelete: deleteFlag }),
  // lists the user manages
  z.object({ op: z.literal("createTag"), label: name }),
  z.object({ op: z.literal("renameTag"), label: name, newLabel: name }),
  z.object({ op: z.literal("deleteTag"), label: name, userAskedToDelete: deleteFlag }),
  z.object({ op: z.literal("createSituation"), who: person, label: name }),
  z.object({ op: z.literal("renameSituation"), who: person, label: name, newLabel: name }),
  z.object({ op: z.literal("deleteSituation"), who: person, label: name, userAskedToDelete: deleteFlag }),
  z.object({ op: z.literal("createShoppingSection"), name }),
  z.object({ op: z.literal("renameShoppingSection"), name, newName: name }),
  z.object({ op: z.literal("deleteShoppingSection"), name, userAskedToDelete: deleteFlag }),
  z.object({ op: z.literal("setIngredientSection"), ingredient: name, section: name }),
  z.object({ op: z.literal("recomputeShoppingSections") }).describe("Alle ingrediënten opnieuw automatisch in winkelsecties indelen"),
  // shopping list
  z.object({ op: z.literal("addShoppingItems"), items: z.array(name).min(1).max(40).describe("Komen bij 'Zelf toegevoegd'") }),
  z.object({ op: z.literal("checkShoppingItems"), items: z.array(name).min(1).max(40), checked: z.boolean() }),
  z.object({ op: z.literal("removeShoppingItems"), items: z.array(name).min(1).max(40), userAskedToDelete: deleteFlag }),
  z.object({ op: z.literal("updateShoppingFromPlanning"), dates: z.array(date).min(1).max(31).describe("Vervangt 'Uit je planning' door de ingrediënten van deze dagen") }),
]);
export type Op = z.infer<typeof OpSchema>;

export const OPS_MAX = 20;
export const OpsSchema = z.array(OpSchema).min(1).max(OPS_MAX);

export const ProposeChangeInput = z.object({
  title: z.string().trim().min(3).max(160).describe("Eén korte Nederlandse zin die zegt wat er verandert, bv. 'Robin op zondag 22/11: Thuis → Gent - Entourage'"),
  ops: OpsSchema,
});

/** What the client (components/chat/approval-card.tsx) sends back as the tool
 *  result: the /api/chat/apply response, or { declined: true }. */
export const ProposeChangeOutput = z.union([
  z.object({ ok: z.literal(true), summary: z.string(), undoId: z.string(), changed: z.string().optional() }),
  z.object({ ok: z.literal(false), error: z.string() }),
  z.object({ declined: z.literal(true) }),
]);

export const DELETE_OPS = new Set(OpSchema.options.filter((o) => "userAskedToDelete" in o.shape).map((o) => o.shape.op.value));
