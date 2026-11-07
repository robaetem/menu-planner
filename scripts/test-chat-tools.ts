/* Chat safety + status derivation checks. Run: corepack pnpm dlx tsx scripts/test-chat-tools.ts */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { derive, type Facts } from "../lib/change/status";
import { safePath } from "../lib/chat/code-tools";
import { docToText } from "../lib/chat/data-tools";

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

process.exit(failed ? 1 : 0);
