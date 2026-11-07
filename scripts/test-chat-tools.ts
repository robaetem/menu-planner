/* Chat safety + status derivation checks. Run: corepack pnpm dlx tsx scripts/test-chat-tools.ts
 * With CHAT_TEST_LOCAL_DB=1 it also applies and undoes chat data changes on the
 * LOCAL Supabase (pnpm db:start); it refuses to run against anything else. */
import { LOCAL_DB } from "./chat-test-env";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { derive, type Facts } from "../lib/change/status";
import { grep, safePath, untar } from "../lib/chat/code-tools";
import { CHAT_TABLES, dataTools, dayLabel, docToText, matchesAll, norm } from "../lib/chat/data-tools";
import { APP_KNOWLEDGE } from "../lib/chat/app-knowledge";
import { appGuideTools } from "../lib/chat/app-guide";
import { DELETE_OPS, OpSchema, OpsSchema, ProposeChangeInput } from "../lib/chat/ops";
import { buildChatTools } from "../lib/chat/tools";

let failed = 0;
function check(name: string, ok: boolean, extra?: unknown) {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` ${JSON.stringify(extra)}`}`);
}

// 1. lib/chat must never write: no insert/update/delete/upsert/rpc, no workflow dispatch, no secret key.
const FORBIDDEN = [/\.(insert|update|delete|upsert|rpc)\s*\(/, /dispatchWorkflow/, /SUPABASE_SECRET_KEY/, /change_runs/, /method:\s*["'](POST|PUT|PATCH|DELETE)/i];
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
for (const file of walk("lib/chat")) {
  const src = readFileSync(file, "utf8");
  for (const re of FORBIDDEN) check(`${file} has no ${re}`, !re.test(src));
}

// 1b. Only select on allow-listed tables: every from("x") in lib/chat names a CHAT_TABLES entry.
const ALLOWED_TABLES = new Set<string>(CHAT_TABLES);
check("CHAT_TABLES has no write-only or change table", !ALLOWED_TABLES.has("change_runs"));
for (const file of walk("lib/chat")) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/\bfrom\(\s*["'`]([\w-]+)["'`]/g)) check(`${file} reads allow-listed table ${m[1]}`, ALLOWED_TABLES.has(m[1]));
  // The one typed wrapper `getDb().from(t)` (t: ChatTable) is the only non-literal table.
  const rest = src.replace(/\b(Buffer|Array)\.from\(/g, "").replace("getDb().from(t)", "");
  check(`${file} has no .from( with a non-literal table`, !/\.from\(\s*[^"'`\s)]/.test(rest));
}

// 1c. Imports from outside lib/chat: only allow-listed read-only helpers (never
// settleFreezer, syncMealStock, server actions, dispatchWorkflow, ...).
const ALLOWED_IMPORTS: Record<string, string[]> = {
  "@/lib/supabase/server": ["getDb", "DEV_BYPASS"],
  "@/lib/date": ["addIsoDays", "todayIso"],
  "@/lib/data": ["getShoppingDocs", "listPortions", "listRecipes", "getRecipe", "listVleesjes", "listGroenten", "listTags", "listModes", "listCategories", "getHousehold"],
  "@/lib/freezer/stock-server": ["loadStock"],
  "@/lib/freezer/stock": ["mealStockStatus", "type FreezerStock", "FreezerStock"],
  "@/lib/freezer/potjes": ["readyOn"],
  "@/app/(protected)/planning/config": ["resolveTitle"],
  "@/lib/types": ["*"],
  "@/lib/change/github": ["gh", "repo"],
  "@/lib/change/runs": ["startChange"],
  "./ops": ["*"],
  "@clerk/nextjs/server": ["currentUser"],
};
const PACKAGES = new Set(["ai", "zod", "date-fns", "date-fns/locale", "node:zlib"]);
for (const file of walk("lib/chat")) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/import\s+(type\s+)?(?:\{([^}]*)\}|(\w+))\s+from\s+["']([^"']+)["']/g)) {
    const mod = m[4];
    if (mod.startsWith("./") || PACKAGES.has(mod)) continue;
    const allowed = ALLOWED_IMPORTS[mod];
    if (!allowed) {
      check(`${file} imports only allow-listed modules (${mod})`, false, mod);
      continue;
    }
    if (allowed.includes("*") || m[1]) continue;
    const names = (m[2] ?? m[3] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    for (const n of names) check(`${file} import ${n} from ${mod} is allow-listed`, allowed.includes(n), n);
  }
}

// 1d. Every chat tool is known: read-only data/guide/code tools plus request_change.
const READ_TOOLS = ["getPlanning", "findMeals", "listRecipes", "getRecipe", "getFreezer", "getShoppingList", "getSettings", "appGuide", "searchCode", "listFiles", "readFile"];
check("data tools are all known read tools", Object.keys(dataTools).every((k) => READ_TOOLS.includes(k)), Object.keys(dataTools));
// Changes are only proposed: the two propose tools have no execute (the client
// shows an approval card), and no other tool exists besides the read tools.
const all = buildChatTools("t@t") as Record<string, any>;
check("only read + propose tools", Object.keys(all).every((k) => READ_TOOLS.includes(k) || k === "proposeChange" || k === "proposeCodeChange"), Object.keys(all));
check("proposeChange has no execute", typeof all.proposeChange.execute === "undefined");
check("proposeCodeChange has no execute", typeof all.proposeCodeChange.execute === "undefined");
check("no request_change tool any more", !("request_change" in all));

// Op schema: deletes only as delete* ops with userAskedToDelete: true.
check("delete ops all start with delete/remove/clear", [...DELETE_OPS].every((o) => /^(delete|remove|clear)/.test(o)) && DELETE_OPS.size >= 8, [...DELETE_OPS]);
check("non-delete ops have no delete flag", OpSchema.options.every((o) => /^(delete|remove|clear)/.test(o.shape.op.value) === ("userAskedToDelete" in o.shape)));
check("delete without flag is rejected", !OpSchema.safeParse({ op: "deleteMeal", date: "2027-01-01", meal: "x" }).success);
check("delete with flag false is rejected", !OpSchema.safeParse({ op: "deleteMeal", date: "2027-01-01", meal: "x", userAskedToDelete: false }).success);
check("delete with flag is accepted", OpSchema.safeParse({ op: "deleteMeal", date: "2027-01-01", meal: "x", userAskedToDelete: true }).success);
check("unknown op is rejected", !OpSchema.safeParse({ op: "dropTable", table: "recipes" }).success);
check("situation op ok", ProposeChangeInput.safeParse({ title: "Robin op zondag 22/11: Thuis → Gent", ops: [{ op: "setSituation", date: "2026-11-22", who: "Robin", situation: "Gent - Entourage" }] }).success);
check("max ops", !OpsSchema.safeParse(Array.from({ length: 21 }, () => ({ op: "extendPlanning", days: 1 }))).success);

// 2. path guard
check("safePath ok", safePath("lib/data.ts") === "lib/data.ts");
check("safePath blocks .env", safePath(".env.local") === null && safePath("a/.env") === null);
check("safePath blocks ..", safePath("../x") === null && safePath(".git/config") === null);

// searchCode: tar reader skips secrets/binaries, grep finds lines.
{
  const entry = (name: string, body: string, type = "0") => {
    const h = Buffer.alloc(512);
    h.write(name, 0);
    h.write(Buffer.byteLength(body).toString(8).padStart(11, "0"), 124);
    h.write(type, 156);
    const b = Buffer.alloc(Math.ceil(Buffer.byteLength(body) / 512) * 512);
    b.write(body);
    return Buffer.concat([h, b]);
  };
  const longPath = "app/(protected)/planning/" + "x".repeat(120) + ".tsx";
  const tar = Buffer.concat([
    entry("o-r-sha/", "", "5"),
    entry("o-r-sha/lib/a.ts", "const x = 1;\nexport function settle() {}\n"),
    entry("o-r-sha/.env.local", "SECRET=1"),
    entry("o-r-sha/public/logo.png", "PNG"),
    entry("pax", `${("path=o-r-sha/" + longPath).length + 5} path=o-r-sha/${longPath}\n`, "x"),
    entry("o-r-sha/short", "Zelf toegevoegd blijft staan"),
    Buffer.alloc(1024),
  ]);
  const files = untar(tar);
  check("untar keeps code, drops .env and images", files.map((f) => f.path).join(",") === `lib/a.ts,${longPath}`, files.map((f) => f.path));
  const g = grep(files, "EXPORT settle");
  check("grep matches all words, case-insensitive", g.matches.length === 1 && g.matches[0].line === 2 && g.matches[0].path === "lib/a.ts", g);
  check("grep under a folder", grep(files, "zelf", "app/").matches.length === 1 && grep(files, "zelf", "lib/").matches.length === 0);
}

// 3. status derivation
const base: Facts = { workflow: null, pr: null, checks: [], deploy: null, ageMs: 1000 };
const pr = (o = {}) => ({ number: 7, html_url: "u", body: "Kleur aangepast.\n\nDetails", state: "open", merged_at: null, merge_commit_sha: null, head_sha: "h", ...o });
const s = (f: Partial<Facts>) => derive({ ...base, ...f });
check("queued", s({ workflow: { status: "queued", conclusion: null } }).status === "queued");
check("running", s({ workflow: { status: "in_progress", conclusion: null } }).status === "running");
check("workflow failed", s({ workflow: { status: "completed", conclusion: "failure" } }).status === "failed");
check("no run yet", s({}).status === "queued");
check("no run, old", s({ ageMs: 10 * 60_000 }).status === "failed");
check("checking", s({ pr: pr(), checks: [{ name: "build", status: "in_progress", conclusion: null }] }).status === "checking");
const blocked = s({ pr: pr(), checks: [{ name: "guardrail", status: "completed", conclusion: "failure", output: { summary: "Raakt data aan" } }] });
check("blocked", blocked.status === "blocked" && blocked.reason === "Raakt data aan", blocked);
check("summary", s({ pr: pr() }).summary === "Kleur aangepast.");
const merged = pr({ merged_at: "t", state: "closed", merge_commit_sha: "abc" });
check("deploying", s({ pr: merged, deploy: "pending" }).status === "deploying");
check("deploying (no status yet)", s({ pr: merged }).status === "deploying");
const live = s({ pr: merged, deploy: "success" });
check("live", live.status === "live" && live.mergeSha === "abc");
check("deploy failed", s({ pr: merged, deploy: "failure" }).status === "failed");
check("closed unmerged", s({ pr: pr({ state: "closed" }) }).status === "failed");

// 4. shopping doc flatten
check("docToText", docToText({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "melk" }] }] }) === "melk");

check("docToText task item", docToText({ type: "doc", content: [{ type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "melk" }] }] }] }] }) === "[x] melk");

// 5. matching helpers
check("norm folds quotes and accents", norm("Z’n Grieks Crème") === "z'n grieks creme");
check("matchesAll every word", matchesAll("Pittige risotto met prei en scampi's", "risotto scampi") && !matchesAll("Prei", "risotto prei"));
check("matchesAll plural", matchesAll("Hamburger", "hamburgers"));
check("dayLabel has weekday", /^za 7 nov/.test(dayLabel("2026-11-07")), dayLabel("2026-11-07"));

// 6. app guide
check("app knowledge has topics", APP_KNOWLEDGE.length >= 12 && APP_KNOWLEDGE.every((k) => k.topic && k.title && k.text.length > 80));
check("app knowledge is unique", new Set(APP_KNOWLEDGE.map((k) => k.topic)).size === APP_KNOWLEDGE.length);
(async () => {
  const g: any = await (appGuideTools.appGuide as any).execute({ topics: ["boodschappenlijst"] }, {});
  check("appGuide picks a topic", g.topics.length >= 1 && g.topics.length < APP_KNOWLEDGE.length && /Zelf toegevoegd/.test(g.topics[0].text));
  const all: any = await (appGuideTools.appGuide as any).execute({}, {});
  check("appGuide without topic gives all", all.topics.length === APP_KNOWLEDGE.length);
  if (LOCAL_DB) await dbTests();
  else console.log("skip apply/undo DB tests (set CHAT_TEST_LOCAL_DB=1 with the local Supabase running)");
  process.exit(failed ? 1 : 0);
})();

// 7. apply + undo on the LOCAL database (chat-test-env refuses anything else).
async function dbTests() {
  const { getDb } = await import("../lib/supabase/server");
  const { snapshot, stable } = await import("../app/api/chat/apply/journal");
  const { settleFreezer } = await import("../lib/freezer/stock-server");
  const apply = (await import("../app/api/chat/apply/route")).POST;
  const undo = (await import("../app/api/chat/apply/[undoId]/undo/route")).POST;
  const db = getDb();
  const post = async (ops: unknown, title = "test") => (await apply(new Request("http://t/api/chat/apply", { method: "POST", body: JSON.stringify({ title, ops }) }))).json();
  const undoReq = async (id: string) => {
    const r = await undo(new Request("http://t/x", { method: "POST" }), { params: Promise.resolve({ undoId: id }) });
    return { status: r.status, body: await r.json() };
  };
  const state = async () => stable(await snapshot(db));
  await settleFreezer(db);
  const D = (n: number) => `2031-01-${String(n).padStart(2, "0")}`; // far future: never real plans

  const robinMode = (await db.from("plan_modes").select("label").eq("who", "robin").limit(1)).data?.[0]?.label;
  const recipe = (await db.from("recipes").select("title").order("title").limit(1)).data?.[0]?.title;
  check("local DB has a robin mode and a recipe", !!robinMode && !!recipe);

  // a. situation (Robin's example) + undo restores exactly.
  const s0 = await state();
  const a = await post([{ op: "setSituation", date: D(10), who: "Robin", situation: robinMode }]);
  const day = (await db.from("plan_days").select("robin_mode").eq("day_date", D(10)).maybeSingle()).data;
  check("setSituation applied", a.ok === true && !!a.undoId && !!day?.robin_mode, a);
  const ua = await undoReq(a.undoId);
  check("undo setSituation", ua.status === 200 && ua.body.ok === true, ua);
  check("undo restores the exact state (situation)", (await state()) === s0);
  check("undo twice is refused", (await undoReq(a.undoId)).status === 409);

  // b. many ops in one change, then undo everything.
  const s1 = await state();
  const b = await post([
    { op: "createTag", label: "Chattest" },
    { op: "createRecipe", title: "Chattest soep", tags: ["Chattest"], ingredients: [{ name: "Wortel", amount: 4, unit: "stuk" }, { name: "Room", perPerson: { Robin: 100, Amber: 50 }, unit: "ml" }], method: "Koken." },
    { op: "addMeal", date: D(11), who: "Samen", recipe: "Chattest soep" },
    { op: "setExtraPotjes", date: D(11), meal: "Chattest soep", robin: 1, amber: 2 },
    { op: "setDayNote", date: D(11), note: "test notitie" },
    { op: "addVleesje", name: "Chattest vlees", count: 3 },
    { op: "addGroente", name: "Chattest erwten", amount: 500, unit: "gram" },
    { op: "addPotjes", name: "Chattest potje", robin: 1, amber: 1 },
    { op: "addShoppingItems", items: ["chattest melk", "chattest brood"] },
    { op: "checkShoppingItems", items: ["chattest melk"], checked: true },
  ]);
  check("multi-op change applied", b.ok === true, b);
  const r = (await db.from("recipes").select("id, tags, ingredients(name, amount, scaling, amounts_per_person)").eq("title", "Chattest soep").maybeSingle()).data as any;
  check("recipe stored like the editor (Samen ÷ 2, per person)", r?.tags?.includes("chattest") && r.ingredients.some((i: any) => i.name === "Wortel" && Number(i.amount) === 2) && r.ingredients.some((i: any) => i.scaling === "per_person" && i.amounts_per_person.robin === 100), r);
  const meal = (await db.from("plan_meals").select("freezer_robin, freezer_amber, day:plan_days!inner(day_date)").eq("day.day_date", D(11)).maybeSingle()).data as any;
  check("meal planned with extra potjes", meal?.freezer_robin === 1 && meal?.freezer_amber === 2, meal);
  const portions = (await db.from("freezer_portions").select("id").eq("name", "Chattest potje")).data ?? [];
  check("potjes frozen", portions.length === 2);
  const shop = JSON.stringify((await db.from("shopping_doc").select("content").order("id").limit(1).maybeSingle()).data?.content);
  check("shopping items added and checked", shop.includes("chattest brood") && /"checked":true[^}]*}[^\]]*chattest melk|chattest melk/.test(shop));
  const ub = await undoReq(b.undoId);
  check("undo multi-op change", ub.body.ok === true, ub);
  check("undo restores the exact state (multi-op)", (await state()) === s1);

  // c. a failing op rolls the whole change back.
  const s2 = await state();
  const c = await post([{ op: "setDayNote", date: D(12), note: "blijft niet" }, { op: "addMeal", date: D(12), who: "Samen", recipe: "Dit recept bestaat niet 123" }]);
  check("failing op -> ok:false with reason", c.ok === false && /niet gevonden/.test(c.error), c);
  check("failing op changed nothing", (await state()) === s2);

  // d. validation: delete without the flag, unknown op.
  check("delete without flag refused", (await post([{ op: "deleteMeal", date: D(1), meal: "x" }])).ok === false);
  check("unknown op refused", (await post([{ op: "sql", q: "drop table recipes" }])).ok === false);
  check("validation changed nothing", (await state()) === s2);

  // e. editing existing data, deleting, and undo.
  const s3 = await state();
  const e1 = await post([
    { op: "addMeal", date: D(13), who: "Amber", recipe },
    { op: "updateRecipe", recipe, addIngredients: [{ name: "Chattest peper", amount: 1, unit: "koffielepel" }], notes: "chattest notitie" },
  ]);
  check("edit existing recipe applied", e1.ok === true, e1);
  const e2 = await post([{ op: "deleteMeal", date: D(13), meal: recipe, who: "Amber", userAskedToDelete: true }]);
  check("delete meal applied", e2.ok === true, e2);
  check("undo delete", (await undoReq(e2.undoId)).body.ok === true);
  check("deleted meal is back", ((await db.from("plan_meals").select("id, day:plan_days!inner(day_date)").eq("day.day_date", D(13))).data ?? []).length === 1);
  check("undo edit", (await undoReq(e1.undoId)).body.ok === true);
  check("undo restores the exact state (edit + delete)", (await state()) === s3);

  // e2. photo link: set and clear only touch the row; undo puts it back.
  const s4 = await state();
  const p1 = await post([{ op: "setRecipeImage", recipe, imageUrl: "https://example.com/soep.jpg" }]);
  const img = (await db.from("recipes").select("image_path").eq("title", recipe).maybeSingle()).data?.image_path;
  check("setRecipeImage applied", p1.ok === true && img === "https://example.com/soep.jpg", { p1, img });
  const p2 = await post([{ op: "clearRecipeImage", recipe, userAskedToDelete: true }]);
  check("clearRecipeImage applied", p2.ok === true && (await db.from("recipes").select("image_path").eq("title", recipe).maybeSingle()).data?.image_path === null, p2);
  check("undo clear + set", (await undoReq(p2.undoId)).body.ok === true && (await undoReq(p1.undoId)).body.ok === true);
  check("undo restores the exact state (photo)", (await state()) === s4);
  check("bad photo link refused", (await post([{ op: "setRecipeImage", recipe, imageUrl: "javascript:alert(1)" }])).ok === false);

  // f. undo refuses when the same rows were edited since (no lost work).
  const f = await post([{ op: "setDayNote", date: D(14), note: "eerst" }]);
  await db.from("plan_days").update({ note: "later met de hand" }).eq("day_date", D(14));
  const uf = await undoReq(f.undoId);
  check("undo conflict refused", uf.status === 409 && uf.body.ok === false, uf);
  check("conflicting edit kept", (await db.from("plan_days").select("note").eq("day_date", D(14)).maybeSingle()).data?.note === "later met de hand");
  await db.from("plan_days").delete().eq("day_date", D(14)); // test cleanup (local DB only)
}
