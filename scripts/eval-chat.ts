/* Chat tone + speed eval. Runs the real chat setup (prompt, model, tools) against
 * READ-ONLY production data and records answer, words, time to first token,
 * total time and tools per turn. request_change and proposeChange are stubbed: nothing is applied or dispatched.
 *
 * Run: corepack pnpm dlx tsx scripts/eval-chat.ts [label] [caseId,caseId,...]
 * Env: reads ../menu-planner/.env.prod.local (Supabase) and .env.local
 * (OPENROUTER_API_KEY) from the main checkout; GitHub token from the robaetem
 * gh login. Nothing is printed except answers and timings.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MAIN = process.env.MENU_PLANNER_MAIN ?? join(process.cwd(), "..", "menu-planner");

function loadEnv(file: string, keys?: string[]) {
  if (!existsSync(file)) throw new Error(`missing ${file}`);
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (keys && !keys.includes(m[1])) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

loadEnv(join(MAIN, ".env.local"), ["OPENROUTER_API_KEY"]);
loadEnv(join(MAIN, ".env.prod.local"), ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"]);
process.env.DEV_AUTH_BYPASS = "1"; // getDb() uses the secret key; the fetch guard below keeps it read-only
process.env.GITHUB_REPO_TOKEN ??= execSync("gh auth token", {
  env: { ...process.env, GH_CONFIG_DIR: `${process.env.HOME}/.config/gh-robaetem`, GH_TOKEN: "" },
})
  .toString()
  .trim();

// Read-only guard: any non-GET request to Supabase or GitHub throws.
const supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host;
const realFetch = globalThis.fetch;
let blockedWrites = 0;
globalThis.fetch = (async (input: any, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
  if ((url.host === supabaseHost || url.host === "api.github.com") && method !== "GET" && method !== "HEAD") {
    blockedWrites++;
    throw new Error(`eval guard: blocked ${method} ${url.host}${url.pathname}`);
  }
  return realFetch(input, init);
}) as typeof fetch;

type Turn = { id: string; turns: string[]; note?: string };

const CASES: Turn[] = [
  // data
  { id: "recepten", turns: ["welke recepten heb ik?"] },
  { id: "recepten-alles", turns: ["geef me de volledige lijst van alle recepten"] },
  { id: "kip", turns: ["welke recepten heb ik met kip?"] },
  { id: "donderdag", turns: ["wat eten we donderdag?"] },
  { id: "vandaag", turns: ["wat eten we vanavond?"] },
  { id: "week", turns: ["wat staat er deze week op het menu?"] },
  { id: "diepvries", turns: ["wat ligt er nog in de diepvries?"] },
  { id: "kopen", turns: ["wat moet ik kopen?"] },
  { id: "potjes", turns: ["hoeveel potjes heb ik nog?"] },
  { id: "snel", turns: ["iets snel voor vanavond, wat kan ik maken?"] },
  { id: "recept", turns: ["wat heb ik nodig voor lasagne?"] },
  { id: "vegetarisch", turns: ["hebben we vegetarische recepten?"] },
  { id: "lang-niet", turns: ["wat hebben we al lang niet meer gegeten?"] },
  { id: "gehakt", turns: ["ligt er nog gehakt in de diepvries?"] },
  // how it works
  { id: "hoe-diepvries", turns: ["hoe werkt de diepvrieslijst?"] },
  { id: "tekort", turns: ["waarom staat er tekort bij krokante kip?"] },
  { id: "hoe-boodschappen", turns: ["hoe komt er iets op de boodschappenlijst?"] },
  { id: "hoe-potjes", turns: ["wat zijn potjes eigenlijk?"] },
  { id: "hoe-plannen", turns: ["hoe plan ik een maaltijd in?"] },
  { id: "potje-inplannen", turns: ["gaat een potje direct uit de diepvries als ik hem inplan?"] },
  // change wishes
  { id: "groenten-anders", turns: ["kunnen de groenten anders?"] },
  { id: "knop-rood", turns: ["maak de verzendknop rood"] },
  { id: "knop-rood-ja", turns: ["maak de verzendknop rood", "ja doe maar"] },
  { id: "groter", turns: ["de letters zijn te klein op mijn gsm"] },
  { id: "donker", turns: ["kan je een donkere modus maken?", "ja graag"] },
  // data change requests / destructive
  { id: "verwijder-alles", turns: ["verwijder alle recepten"] },
  { id: "plan-wijzig", turns: ["zet spaghetti op vrijdag"] },
  { id: "kip-weg", turns: ["haal de kip uit de diepvries, die heb ik opgegeten"] },
  { id: "plan-wijzig-ja", turns: ["zet spaghetti op vrijdag", "ja"] },
  // vague / emotional
  { id: "geen-zin", turns: ["ik heb echt geen zin om te koken vandaag"] },
  { id: "help", turns: ["help"] },
  { id: "kapot", turns: ["het werkt niet!!"] },
  { id: "dank", turns: ["merci!"] },
  { id: "wie", turns: ["wie ben jij eigenlijk?"] },
  { id: "ai", turns: ["ben jij een robot?"] },
  { id: "idee", turns: ["geef me een idee voor zondag"] },
  // multi-turn follow-ups
  { id: "mt-kip", turns: ["welke recepten heb ik met kip?", "en welke daarvan is het snelst?", "wat heb ik daarvoor nodig?"] },
  { id: "mt-week", turns: ["wat eten we morgen?", "en overmorgen?", "moet ik daarvoor iets kopen?"] },
  { id: "mt-diepvries", turns: ["wat ligt er in de diepvries?", "en is daar al iets van gepland?"] },
  { id: "english", turns: ["what's for dinner tomorrow?"] },
];

type Rec = {
  id: string;
  turn: number;
  user: string;
  answer: string;
  words: number;
  ttftMs: number | null;
  totalMs: number;
  steps: number;
  tools: string[];
  toolResults: { tool: string; output: string }[];
  error?: string;
};

const STYLE = /(\*\*|^#|goede vraag|kortom|wil je dat ik|kan (ik )?(dat|de|het|geen)[^.]*niet (aanpassen|wijzigen|verwijderen|veranderen)|doe ik niet)/im;
const TECH = /\b(code|bestand|file|github|pull request|\bPR\b|deploy|branch|database|databank|supabase|tool|request_change|listFiles|readFile|getFreezer|getPlanning|migrat|component|api|json|tabel|query|server|next\.js|react|typescript|lib\/|app\/|\.tsx?\b|functie|variabele)/i;
const THIRD = /(de assistent|als ai\b|als taalmodel|ik ben een (ai|taalmodel|chatbot))/i;

async function main() {
  const label = process.argv[2] ?? "run";
  const only = process.argv[3]?.split(",");
  const { streamText } = await import("ai");
  const { systemPrompt } = await import("../lib/chat/system-prompt");
  const { chatModel, chatSettings } = await import("../lib/chat/model");
  const { buildChatTools } = await import("../lib/chat/tools");
  const { todayIso } = await import("../lib/date");

  const tools: Record<string, any> = buildChatTools("eval@local");
  // request_change would dispatch a real change: stub it. proposeChange has
  // no execute (the client shows a "Doen / Niet doen" card): stub it as
  // approved. Nothing is applied or dispatched.
  const { tool } = await import("ai");
  tools.request_change = { ...tools.request_change, execute: async () => ({ runId: "eval-stub" }) };
  tools.proposeChange = tool({
    description: tools.proposeChange.description,
    inputSchema: tools.proposeChange.inputSchema,
    execute: async () => ({ ok: true, summary: "Gedaan.", undoId: "eval-stub" }),
  });
  const model = chatModel(process.env.OPENROUTER_API_KEY!);

  const cases = CASES.filter((c) => !only || only.includes(c.id));
  const out: Rec[] = [];

  async function runCase(c: Turn) {
    const messages: any[] = [];
    for (let i = 0; i < c.turns.length; i++) {
      messages.push({ role: "user", content: c.turns[i] });
      const t0 = performance.now();
      let ttft: number | null = null;
      let text = "";
      const used: string[] = [];
      const results: { tool: string; output: string }[] = [];
      let steps = 0;
      let error: string | undefined;
      try {
        const r = streamText({
          model,
          system: systemPrompt(todayIso()),
          messages,
          tools,
          ...chatSettings,
          onError: ({ error: e }) => {
            error = String((e as any)?.message ?? e);
          },
        });
        for await (const p of r.fullStream) {
          if (p.type === "text-delta" && p.text.trim()) {
            ttft ??= performance.now() - t0;
            text += p.text;
          } else if (p.type === "text-delta") text += p.text;
          else if (p.type === "tool-call") used.push(p.toolName);
          else if (p.type === "tool-result") results.push({ tool: p.toolName, output: JSON.stringify(p.output).slice(0, 4000) });
          else if (p.type === "finish-step") steps++;
          else if (p.type === "error") error = String((p.error as any)?.message ?? p.error);
        }
        messages.push(...(await r.response).messages);
      } catch (e: any) {
        error = String(e?.message ?? e);
      }
      const rec: Rec = {
        id: c.id,
        turn: i + 1,
        user: c.turns[i],
        answer: text.trim(),
        words: text.trim().split(/\s+/).filter(Boolean).length,
        ttftMs: ttft === null ? null : Math.round(ttft),
        totalMs: Math.round(performance.now() - t0),
        steps,
        tools: used,
        toolResults: results,
        error,
      };
      out.push(rec);
      const flags = [TECH.test(rec.answer) ? "TECH" : "", THIRD.test(rec.answer) ? "3RD" : "", rec.words > 20 ? `OVER20` : "", STYLE.test(rec.answer) ? "STYLE" : ""].filter(Boolean).join(",");
      console.log(
        `\n### ${c.id}#${i + 1} ${rec.words}w ttft=${rec.ttftMs}ms total=${rec.totalMs}ms steps=${steps} tools=[${used.join(",")}] ${flags}${error ? ` ERR=${error}` : ""}\n> ${rec.user}\n${rec.answer}`,
      );
    }
  }

  const POOL = Number(process.env.EVAL_POOL ?? 4);
  const queue = [...cases];
  await Promise.all(Array.from({ length: POOL }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) await runCase(c);
  }));

  const med = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN;
  };
  const p90 = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] : NaN;
  };
  const ttfts = out.map((r) => r.ttftMs).filter((x): x is number => x !== null);
  const summary = {
    label,
    turns: out.length,
    medianWords: med(out.map((r) => r.words)),
    medianTtftMs: med(ttfts),
    p90TtftMs: p90(ttfts),
    medianTotalMs: med(out.map((r) => r.totalMs)),
    p90TotalMs: p90(out.map((r) => r.totalMs)),
    medianSteps: med(out.map((r) => r.steps)),
    over20: out.filter((r) => r.words > 20).length,
    over30: out.filter((r) => r.words > 30).length,
    styleFlags: out.filter((r) => STYLE.test(r.answer)).length,
    techFlags: out.filter((r) => TECH.test(r.answer)).length,
    thirdPersonFlags: out.filter((r) => THIRD.test(r.answer)).length,
    errors: out.filter((r) => r.error).length,
    blockedWrites,
  };
  console.log("\nSUMMARY", JSON.stringify(summary));
  const dir = process.env.EVAL_OUT ?? "/tmp/menu-chat-eval";
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${label}.json`), JSON.stringify({ summary, records: out }, null, 2));
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
