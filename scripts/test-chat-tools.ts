/* Chat safety + status derivation checks. Run: corepack pnpm dlx tsx scripts/test-chat-tools.ts */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { derive, type Facts } from "../lib/change/status";
import { safePath } from "../lib/chat/code-tools";
import { CHAT_TABLES, dataTools, dayLabel, docToText, matchesAll, norm } from "../lib/chat/data-tools";
import { APP_KNOWLEDGE } from "../lib/chat/app-knowledge";
import { appGuideTools } from "../lib/chat/app-guide";

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
  "@/lib/change/github": ["gh"],
  "@/lib/change/runs": ["startChange"],
  "@clerk/nextjs/server": ["currentUser"],
};
const PACKAGES = new Set(["ai", "zod", "date-fns", "date-fns/locale"]);
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
const READ_TOOLS = ["getPlanning", "findMeals", "listRecipes", "getRecipe", "getFreezer", "getShoppingList", "getSettings", "appGuide", "listFiles", "readFile"];
check("data tools are all known read tools", Object.keys(dataTools).every((k) => READ_TOOLS.includes(k)), Object.keys(dataTools));
const toolsSrc = readFileSync("lib/chat/tools.ts", "utf8");
check("request_change contract {request} -> {runId}", /request:\s*z\.string\(\)/.test(toolsSrc) && /\{\s*runId:\s*r\.runId\s*\}/.test(toolsSrc));

// 2. path guard
check("safePath ok", safePath("lib/data.ts") === "lib/data.ts");
check("safePath blocks .env", safePath(".env.local") === null && safePath("a/.env") === null);
check("safePath blocks ..", safePath("../x") === null && safePath(".git/config") === null);

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
  process.exit(failed ? 1 : 0);
})();
