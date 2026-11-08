/* Live-app coding worker (devbox only). See docs/live-app.md.
   One change at a time: coding agent in a Docker sandbox edits WORK_DIR -> trusted guardrail ->
   type check + lint -> fast-forward LIVE_DIR (the running app picks it up) -> background PR with
   auto-merge so Vercel prod catches up. Undo = git revert on LIVE_DIR + background PR/close.
   Run: npx tsx scripts/live/worker.ts   (env: see CONFIG below) */
import { execFile, spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { check, parseDiff, type FileDiff } from "../guardrail-check";

const env = (k: string, d?: string) => {
  const v = process.env[k] ?? d;
  if (v === undefined) throw new Error(`${k} missing`);
  return v;
};
const CONFIG = {
  port: Number(env("LIVE_WORKER_PORT", "3411")),
  token: env("LIVE_WORKER_TOKEN"),
  liveDir: env("LIVE_DIR"),
  workDir: env("WORK_DIR"),
  stateDir: env("LIVE_STATE_DIR"),
  model: env("AGENT_MODEL", "deepseek/deepseek-v4.1-flash-1017"),
  appUrl: env("LIVE_APP_URL", "http://127.0.0.1:3400"),
  repo: env("GITHUB_REPO", "robaetem/menu-planner"),
  push: env("LIVE_PUSH", "1") === "1",
  sync: env("LIVE_SYNC", "1") === "1",
  agentTimeoutMs: 150_000,
};
const RUN_AGENT = join(__dirname, "run-agent.sh");

type Status = "queued" | "running" | "checking" | "live" | "failed" | "blocked" | "undoing" | "undone";
type Run = {
  id: string;
  request: string;
  requestedBy: string;
  status: Status;
  step?: string;
  summary?: string;
  reason?: string;
  sha?: string;
  baseSha?: string;
  revertSha?: string;
  prNumber?: number;
  prUrl?: string;
  revertPrUrl?: string;
  costUsd?: number;
  createdAt: string;
  timings: Record<string, number>;
};

// ---------- state ----------
mkdirSync(CONFIG.stateDir, { recursive: true });
const STATE = join(CONFIG.stateDir, "runs.json");
const runs = new Map<string, Run>(
  existsSync(STATE) ? Object.entries(JSON.parse(readFileSync(STATE, "utf8")) as Record<string, Run>) : [],
);
function save() {
  const tmp = STATE + ".tmp";
  writeFileSync(tmp, JSON.stringify(Object.fromEntries(runs), null, 1));
  renameSync(tmp, STATE);
}
function set(r: Run, patch: Partial<Run>) {
  Object.assign(r, patch);
  save();
  log({ run: r.id, status: r.status, step: r.step, reason: r.reason });
}
function log(o: Record<string, unknown>) {
  console.log(JSON.stringify({ t: new Date().toISOString(), ...o }));
}
// A restart interrupts in-flight work: say so honestly.
for (const r of runs.values()) {
  if (r.status === "queued" || r.status === "running" || r.status === "checking") {
    r.status = "failed";
    r.reason = "De wijziging is onderbroken";
  }
  if (r.status === "undoing") r.status = "live";
}
save();

// ---------- helpers ----------
function sh(cmd: string, args: string[], opts: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv } = {}) {
  return new Promise<{ code: number; out: string }>((resolve) => {
    execFile(cmd, args, { cwd: opts.cwd, timeout: opts.timeout ?? 120_000, maxBuffer: 64 << 20, env: opts.env ?? process.env },
      (err, stdout, stderr) => resolve({ code: err ? ((err as any).code ?? 1) : 0, out: `${stdout}${stderr}` }));
  });
}
async function git(dir: string, ...args: string[]) {
  const r = await sh("git", args, { cwd: dir });
  if (r.code !== 0) throw new Error(`git ${args.join(" ")}: ${r.out.slice(-400)}`);
  return r.out.trim();
}
const GH_ENV = { ...process.env, GH_CONFIG_DIR: process.env.GH_CONFIG_DIR ?? `${process.env.HOME}/.config/gh-robaetem` };
delete (GH_ENV as any).GH_TOKEN;
const gh = (...args: string[]) => sh("gh", args, { env: GH_ENV, timeout: 60_000 });
const gitPush = (dir: string, ...args: string[]) =>
  sh("git", ["-c", `credential.helper=`, "-c", `credential.helper=!gh auth git-credential`, "push", ...args], { cwd: dir, env: GH_ENV });

// Serial queue: changes, undos and syncs never overlap.
let chain: Promise<unknown> = Promise.resolve();
let busy = 0;
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  busy++;
  const p = chain.then(fn, fn).finally(() => busy--);
  chain = p.catch(() => {});
  return p;
}
const background: Promise<unknown>[] = [];
function bg(p: Promise<unknown>) {
  background.push(p.catch((e) => log({ bgError: String(e) })));
}

// Values that must never appear in a diff (keys of the live app's env file).
function secretValues(): string[] {
  const vals = [process.env.OPENROUTER_API_KEY ?? "", CONFIG.token];
  try {
    for (const line of readFileSync(join(CONFIG.liveDir, ".env.local"), "utf8").split("\n")) {
      const i = line.indexOf("=");
      if (i > 0 && !line.startsWith("#")) vals.push(line.slice(i + 1).trim());
    }
  } catch {}
  return vals.filter((v) => v.length >= 16);
}

async function guard(base: string, head: string): Promise<string[]> {
  const names = (await git(CONFIG.workDir, "diff", "--name-status", "--no-renames", `${base}..${head}`))
    .split("\n").filter(Boolean).map((l) => l.split("\t")[1]);
  const diff = parseDiff(await git(CONFIG.workDir, "diff", "--no-renames", "-U0", `${base}..${head}`));
  const byPath = new Map(diff.map((f) => [f.path, f]));
  const files: FileDiff[] = names.map((p) => byPath.get(p) ?? { path: p, status: "M", added: [], removed: [] });
  const problems = check(files);
  const secrets = secretValues();
  for (const f of files) if (f.added.some((l) => secrets.some((s) => l.includes(s)))) problems.push(`${f.path} bevat een geheime sleutel`);
  // Binary or huge files: never.
  for (const f of files) if (/\.(sql|sh|exe|bin)$/i.test(f.path)) problems.push(`${f.path}: dit soort bestand mag niet`);
  return problems;
}

async function checks(base: string): Promise<{ ok: boolean; log: string }> {
  const changed = (await git(CONFIG.workDir, "diff", "--name-only", "--diff-filter=d", `${base}..HEAD`))
    .split("\n").filter((p) => /\.(tsx?|jsx?)$/.test(p));
  const [tsc, lint] = await Promise.all([
    sh(join(CONFIG.workDir, "node_modules/.bin/tsc"), ["--noEmit", "-p", "."], { cwd: CONFIG.workDir, timeout: 90_000 }),
    changed.length
      ? sh(join(CONFIG.workDir, "node_modules/.bin/eslint"), ["--max-warnings=9999", ...changed], { cwd: CONFIG.workDir, timeout: 90_000 })
      : Promise.resolve({ code: 0, out: "" }),
  ]);
  return { ok: tsc.code === 0 && lint.code === 0, log: `${tsc.out}\n${lint.out}`.trim().slice(-4000) };
}

type AgentResult = { text: string; cost: number; ms: number };
async function agent(prompt: string, attachments?: string): Promise<AgentResult> {
  const t = Date.now();
  const r = await sh(RUN_AGENT, [CONFIG.workDir, CONFIG.model, prompt, attachments ?? ""], { timeout: CONFIG.agentTimeoutMs });
  let text = "";
  let cost = 0;
  for (const line of r.out.split("\n")) {
    if (!line.startsWith("{")) continue;
    try {
      const e = JSON.parse(line);
      if (e.type === "text" && e.part?.text) text = e.part.text;
      if (e.type === "step_finish") cost += e.part?.cost ?? 0;
    } catch {}
  }
  if (r.code !== 0 && !text) log({ agentExit: r.code, tail: r.out.slice(-600) });
  return { text: text.trim(), cost, ms: Date.now() - t };
}

function writeAttachments(id: string, images?: string[]): string | undefined {
  if (!images?.length) return undefined;
  const dir = join(CONFIG.stateDir, "attachments", id);
  mkdirSync(dir, { recursive: true });
  images.slice(0, 3).forEach((u, i) => {
    const m = /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(u);
    if (m) writeFileSync(join(dir, `foto-${i + 1}.${m[1] === "jpeg" ? "jpg" : m[1]}`), Buffer.from(m[2], "base64"));
  });
  return dir;
}

const lastSentence = (s: string) =>
  s.replace(/```[\s\S]*?```/g, "").split("\n").map((l) => l.trim()).filter(Boolean).pop()?.slice(0, 300);

/** Is the live app answering? Any non-5xx counts (pages are behind login). */
async function appHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${CONFIG.appUrl}/`, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

/** Fetch the main pages so the server compiles them before Amber looks. */
export async function prewarm() {
  const t = Date.now();
  await Promise.all(
    ["/", "/planning", "/boodschappenlijstje", "/recepten", "/diepvries", "/vleesjes", "/potjes"].map((p) =>
      fetch(`${CONFIG.appUrl}${p}`, { redirect: "manual", signal: AbortSignal.timeout(60_000) }).catch(() => {}),
    ),
  );
  return Date.now() - t;
}

// ---------- change ----------
async function doChange(r: Run, images?: string[]) {
  const t0 = Date.now();
  set(r, { status: "running", step: "Code aanpassen" });
  const base = await git(CONFIG.liveDir, "rev-parse", "HEAD");
  if ((await git(CONFIG.liveDir, "status", "--porcelain", "--untracked-files=no"))) {
    return set(r, { status: "failed", reason: "De app heeft onbewaarde wijzigingen; Robin moet even kijken" });
  }
  await git(CONFIG.workDir, "fetch", "-q", CONFIG.liveDir, "HEAD");
  await git(CONFIG.workDir, "reset", "-q", "--hard", "FETCH_HEAD");
  await git(CONFIG.workDir, "clean", "-fdq");
  const att = writeAttachments(r.id, images);
  const prompt = `Voer deze wijzigingsaanvraag uit in deze repo. Volg CODING_AGENT.md strikt. Eindig met één korte zin in het Nederlands die zegt wat er voor de gebruiker veranderd is.${att ? "\n\nDe gebruiker stuurde foto's mee (bijgevoegd) als voorbeeld van wat ze bedoelt." : ""}\n\nAanvraag: ${r.request}`;
  let a = await agent(prompt, att);
  let cost = a.cost;
  r.timings.agentMs = a.ms;
  const dirty = async () => !!(await git(CONFIG.workDir, "status", "--porcelain"));
  if (!(await dirty())) {
    return set(r, { status: "failed", step: undefined, costUsd: cost, summary: lastSentence(a.text), reason: "Er is niets veranderd", timings: { ...r.timings, totalMs: Date.now() - t0 } });
  }
  const commit = async () => {
    await git(CONFIG.workDir, "add", "-A");
    await git(CONFIG.workDir, "-c", "user.name=menu-planner-bot", "-c", "user.email=menu-planner-bot@users.noreply.github.com",
      "commit", "-q", "--no-verify", "-m", (lastSentence(a.text) ?? `Wijziging ${r.id}`).slice(0, 70), "-m", `change: ${r.id}\nAanvraag: ${r.request.slice(0, 500)}`);
  };
  await commit();
  set(r, { status: "checking", step: "Controleren", summary: lastSentence(a.text) });
  const tg = Date.now();
  const problems = await guard(base, "HEAD");
  r.timings.guardMs = Date.now() - tg;
  if (problems.length) {
    return set(r, { status: "blocked", step: undefined, costUsd: cost, reason: `De veiligheidscontrole blokkeert dit: ${problems.slice(0, 3).join("; ")}`, timings: { ...r.timings, totalMs: Date.now() - t0 } });
  }
  const tc = Date.now();
  let c = await checks(base);
  r.timings.checkMs = Date.now() - tc;
  if (!c.ok) {
    set(r, { step: "Een foutje herstellen" });
    a = await agent(`${prompt}\n\nJe wijziging is al gemaakt maar de type check of lint faalt. Los dit op met een zo klein mogelijke aanpassing. Fouten:\n${c.log}`, att);
    cost += a.cost;
    r.timings.fixMs = a.ms;
    if (await dirty()) {
      await git(CONFIG.workDir, "add", "-A");
      await git(CONFIG.workDir, "commit", "-q", "--amend", "--no-edit");
    }
    const again = await guard(base, "HEAD");
    if (again.length) return set(r, { status: "blocked", step: undefined, costUsd: cost, reason: `De veiligheidscontrole blokkeert dit: ${again.slice(0, 3).join("; ")}`, timings: { ...r.timings, totalMs: Date.now() - t0 } });
    c = await checks(base);
    if (!c.ok) {
      log({ run: r.id, checkLog: c.log.slice(-1500) });
      return set(r, { status: "failed", step: undefined, costUsd: cost, reason: "De wijziging gaf fouten; er is niets veranderd in de app", timings: { ...r.timings, totalMs: Date.now() - t0 } });
    }
  }
  // Apply: fast-forward the running app.
  set(r, { step: "Live zetten" });
  const sha = await git(CONFIG.workDir, "rev-parse", "HEAD");
  await git(CONFIG.liveDir, "fetch", "-q", CONFIG.workDir, sha);
  await git(CONFIG.liveDir, "merge", "-q", "--ff-only", sha);
  const ta = Date.now();
  await prewarm();
  if (!(await appHealthy())) {
    await git(CONFIG.liveDir, "reset", "-q", "--hard", base);
    return set(r, { status: "failed", step: undefined, costUsd: cost, reason: "De app werkte niet meer met deze wijziging; teruggezet", timings: { ...r.timings, totalMs: Date.now() - t0 } });
  }
  r.timings.applyMs = Date.now() - ta;
  set(r, { status: "live", step: undefined, sha, baseSha: base, costUsd: cost, timings: { ...r.timings, totalMs: Date.now() - t0 } });
  if (CONFIG.push) bg(publishChange(r));
}

async function publishChange(r: Run) {
  const branch = `change/${r.id}`;
  const p = await gitPush(CONFIG.liveDir, "-q", "-f", "origin", `${r.sha}:refs/heads/${branch}`);
  if (p.code !== 0) return log({ run: r.id, pushFailed: p.out.slice(-300) });
  const body = `${r.summary ?? ""}\n\n---\nAanvraag: ${r.request}\nGemaakt in de live app (devbox worker, model ${CONFIG.model}). Al live in de devbox-app; deze PR brengt het naar Vercel.`;
  const pr = await gh("pr", "create", "-R", CONFIG.repo, "--base", "main", "--head", branch, "--title", (r.summary ?? `Wijziging ${r.id}`).slice(0, 70), "--body", body);
  const url = pr.out.match(/https:\/\/github\.com\/\S+\/pull\/(\d+)/);
  if (!url) return log({ run: r.id, prFailed: pr.out.slice(-300) });
  set(r, { prUrl: url[0], prNumber: Number(url[1]) });
  await gh("pr", "merge", "-R", CONFIG.repo, url[0], "--auto", "--squash");
}

// ---------- undo ----------
async function doUndo(r: Run) {
  const t0 = Date.now();
  set(r, { status: "undoing", step: "Ongedaan maken" });
  try {
    await git(CONFIG.liveDir, "-c", "user.name=menu-planner-bot", "-c", "user.email=menu-planner-bot@users.noreply.github.com",
      "revert", "--no-edit", r.sha!);
  } catch (e) {
    await sh("git", ["revert", "--abort"], { cwd: CONFIG.liveDir });
    return set(r, { status: "live", step: undefined, reason: "Ongedaan maken lukte niet: er kwam al iets anders bovenop" });
  }
  const revertSha = await git(CONFIG.liveDir, "rev-parse", "HEAD");
  await prewarm();
  set(r, { status: "undone", step: undefined, revertSha, reason: undefined, timings: { ...r.timings, undoMs: Date.now() - t0 } });
  if (CONFIG.push) bg(publishUndo(r));
}

async function publishUndo(r: Run) {
  await Promise.all(background); // the change's own PR must exist first
  if (!r.prNumber) return;
  const st = await gh("pr", "view", "-R", CONFIG.repo, String(r.prNumber), "--json", "state", "--jq", ".state");
  if (st.out.trim() === "OPEN") {
    await gh("pr", "close", "-R", CONFIG.repo, String(r.prNumber), "--delete-branch", "--comment", "Ongedaan gemaakt in de live app.");
    return;
  }
  if (st.out.trim() !== "MERGED") return;
  const branch = `revert/${r.id}`;
  const p = await gitPush(CONFIG.liveDir, "-q", "-f", "origin", `${r.revertSha}:refs/heads/${branch}`);
  if (p.code !== 0) return log({ run: r.id, pushFailed: p.out.slice(-300) });
  const pr = await gh("pr", "create", "-R", CONFIG.repo, "--base", "main", "--head", branch, "--title", `Ongedaan: ${(r.summary ?? r.id).slice(0, 55)}`, "--body", `Draait #${r.prNumber} terug (ongedaan gemaakt in de live app).`);
  const url = pr.out.match(/https:\/\/github\.com\/\S+\/pull\/\d+/);
  if (url) {
    set(r, { revertPrUrl: url[0] });
    await gh("pr", "merge", "-R", CONFIG.repo, url[0], "--auto", "--squash");
  }
}

// ---------- sync with main ----------
/** Bring the live checkout to origin/main when nothing of ours is still on its way. */
async function syncMain() {
  await Promise.all(background);
  await git(CONFIG.liveDir, "fetch", "-q", "origin", "main");
  const [head, main] = await Promise.all([git(CONFIG.liveDir, "rev-parse", "HEAD^{tree}"), git(CONFIG.liveDir, "rev-parse", "origin/main^{tree}")]);
  const pending = [...runs.values()].filter((r) => (r.prNumber && (r.status === "live" || r.status === "undone")) && !r.timings.settled);
  for (const r of pending) {
    const st = (await gh("pr", "view", "-R", CONFIG.repo, String(r.revertPrUrl ?? r.prNumber), "--json", "state,statusCheckRollup",
      "--jq", '.state + " " + ([.statusCheckRollup[]? | select(.conclusion=="FAILURE")] | length | tostring)')).out.trim();
    const [state, failed] = st.split(" ");
    if (state === "MERGED" || state === "CLOSED") r.timings.settled = Date.now();
    else if (state === "OPEN" && Number(failed) > 0) {
      await gh("pr", "close", "-R", CONFIG.repo, String(r.revertPrUrl ?? r.prNumber), "--comment", "Controle online faalde; niet naar Vercel gebracht.");
      r.timings.settled = Date.now();
      if (r.status === "live") r.reason = "Online controle faalde; Robin kijkt ernaar";
      log({ run: r.id, closedFailedPr: r.prNumber });
    }
  }
  save();
  const open = pending.filter((r) => !r.timings.settled);
  if (head === main) {
    await git(CONFIG.liveDir, "reset", "-q", "--hard", "origin/main"); // same files, aligns history
    return;
  }
  if (open.length) return; // our changes are still on their way to main
  if (await git(CONFIG.liveDir, "status", "--porcelain", "--untracked-files=no")) return log({ sync: "live checkout dirty, skipped" });
  const before = await git(CONFIG.liveDir, "rev-parse", "HEAD");
  const deps = await git(CONFIG.liveDir, "diff", "--name-only", before, "origin/main", "--", "package.json", "pnpm-lock.yaml");
  await git(CONFIG.liveDir, "reset", "-q", "--hard", "origin/main");
  log({ sync: "live checkout moved to origin/main", from: before, deps: !!deps });
  if (deps) {
    await sh("corepack", ["pnpm", "install", "--frozen-lockfile"], { cwd: CONFIG.liveDir, timeout: 300_000 });
    await sh("corepack", ["pnpm", "install", "--frozen-lockfile", "--offline"], { cwd: CONFIG.workDir, timeout: 300_000 });
    restartApp("dependencies changed");
  }
  await prewarm();
}

let lastRestart = 0;
function restartApp(why: string) {
  if (Date.now() - lastRestart < 120_000) return;
  lastRestart = Date.now();
  log({ restartApp: why });
  // The app's run loop (scripts/live/app.sh) starts it again.
  spawn("pkill", ["-f", `--port ${new URL(CONFIG.appUrl).port}`], { stdio: "ignore" });
}

// ---------- watchdog + timers ----------
let unhealthy = 0;
setInterval(async () => {
  if (busy) return;
  if (await appHealthy()) unhealthy = 0;
  else if (++unhealthy >= 3) {
    unhealthy = 0;
    restartApp("health check failed 3x");
  }
}, 30_000);
if (CONFIG.sync) setInterval(() => { if (!busy) enqueue(syncMain).catch((e) => log({ syncError: String(e) })); }, 60_000);

// ---------- HTTP ----------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function authed(req: IncomingMessage) {
  const got = Buffer.from(req.headers.authorization ?? "");
  const want = Buffer.from(`Bearer ${CONFIG.token}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
function send(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "content-type": "application/json" }).end(JSON.stringify(body));
}
async function body(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 12 << 20) throw new Error("too big");
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
const view = (r: Run) => ({
  status: r.status, step: r.step, summary: r.summary, reason: r.reason, prUrl: r.prUrl,
  canUndo: r.status === "live" && !!r.sha, timings: r.timings,
});

createServer(async (req, res) => {
  try {
    if (req.url === "/health") return send(res, 200, { ok: true, busy });
    if (!authed(req)) return send(res, 401, { error: "unauthorized" });
    const m = /^\/changes\/([^/]+)(\/undo)?$/.exec(req.url ?? "");
    if (req.method === "POST" && req.url === "/changes") {
      const b = await body(req);
      if (!UUID.test(b.id ?? "") || typeof b.request !== "string" || !b.request.trim()) return send(res, 400, { error: "bad input" });
      if (runs.has(b.id)) return send(res, 409, { error: "exists" });
      const images = Array.isArray(b.images) ? b.images.filter((u: unknown) => typeof u === "string" && u.length < 4_200_000).slice(0, 3) : undefined;
      const r: Run = { id: b.id, request: b.request.slice(0, 4000), requestedBy: String(b.requestedBy ?? ""), status: "queued", step: "In de wachtrij", createdAt: new Date().toISOString(), timings: {} };
      runs.set(r.id, r);
      save();
      enqueue(() => doChange(r, images)).catch((e) => {
        log({ run: r.id, error: String(e) });
        set(r, { status: "failed", step: undefined, reason: "Er ging iets mis bij het aanpassen" });
      }).finally(() => rmSync(join(CONFIG.stateDir, "attachments", r.id), { recursive: true, force: true }));
      return send(res, 202, { status: "queued" });
    }
    if (m && UUID.test(m[1])) {
      const r = runs.get(m[1]);
      if (!r) return send(res, 404, { error: "not found" });
      if (req.method === "GET" && !m[2]) return send(res, 200, view(r));
      if (req.method === "POST" && m[2]) {
        if (r.status !== "live" || !r.sha) return send(res, 409, { error: "not live" });
        set(r, { status: "undoing", step: "Ongedaan maken" });
        enqueue(() => doUndo(r)).catch((e) => {
          log({ run: r.id, undoError: String(e) });
          set(r, { status: "live", step: undefined, reason: "Ongedaan maken lukte niet" });
        });
        return send(res, 202, { status: "undoing" });
      }
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 500, { error: String(e).slice(0, 200) });
  }
}).listen(CONFIG.port, "127.0.0.1", () => log({ listening: CONFIG.port, model: CONFIG.model, live: CONFIG.liveDir }));
