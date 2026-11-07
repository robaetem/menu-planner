/* Guardrail for AI-made pull requests (branches change/*).
   Fails when the diff touches protected paths or adds data-destroying code.
   Usage (CI): npx tsx scripts/guardrail-check.ts <base-ref> <head-ref> <branch-name>
   Only reads git output as text; never runs code from the PR. */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

export type FileDiff = { path: string; status: string; added: string[]; removed: string[] };

const PROTECTED: [RegExp, string][] = [
  [/^supabase\//, "supabase/**"],
  [/^\.github\//, ".github/**"],
  [/^proxy\.ts$/, "proxy.ts"],
  [/^app\/\(protected\)\/layout\.tsx$/, "app/(protected)/layout.tsx"],
  [/(^|\/)\.env/, ".env*"],
  [/^next\.config\.js$/, "next.config.js"],
  [/^scripts\//, "scripts/**"],
  [/^(CODING_AGENT\.md|AGENTS\.md|CLAUDE\.md|opencode\.json)$/, "agent rules/config"],
  [/^(pnpm-workspace\.yaml|pnpm-lock\.yaml\.bak|vercel\.json|\.npmrc|\.gitignore)$/, "build/deploy config"],
  // The chat and change machinery itself, and the database/auth plumbing. (The chat screens in components/chat stay editable.)
  [/^app\/api\//, "app/api/** (API routes)"],
  [/^lib\/(change|chat|supabase)\//, "lib/change, lib/chat, lib/supabase"],
];

const DANGEROUS: [RegExp, string][] = [
  [/\.delete\(/, ".delete("],
  [/\.truncate/, ".truncate"],
  [/drop\s+table/i, "drop table"],
  [/delete\s+from/i, "delete from"],
  [/\.upsert\(/, ".upsert("],
  [/\.update\(/, ".update("],
  [/\.rpc\(/, ".rpc("],
  [/process\.env\.(GITHUB|OPENROUTER|SUPABASE|CLERK)\w*/, "secret env var access"],
  [/DEV_AUTH_BYPASS/, "DEV_AUTH_BYPASS"],
];

export function check(files: FileDiff[]): string[] {
  const problems: string[] = [];
  for (const f of files) {
    const hit = PROTECTED.find(([re]) => re.test(f.path));
    if (hit) problems.push(`${f.path} is protected (${hit[1]})`);
    if (/ALLOWED_EMAILS/.test(f.added.join("\n") + f.removed.join("\n")))
      problems.push(`${f.path} changes ALLOWED_EMAILS`);
    if (f.path === "package.json") {
      const dep = (l: string) => /^\s*"[^"]+":\s*"[^"]+",?\s*$/.test(l);
      const addedKeys = new Set(f.added.filter(dep).map((l) => l.trim().split('"')[1]));
      const gone = f.removed.filter(dep).map((l) => l.trim().split('"')[1]).filter((k) => !addedKeys.has(k));
      if (gone.length) problems.push(`package.json removes entries: ${gone.join(", ")}`);
      // Only dependency version lines may change: no scripts (postinstall etc.), no other fields.
      const odd = f.added.filter((l) => l.trim() && !/^\s*"[^"]+":\s*"(\^|~|>=)?\d[^"\s]*",?\s*$/.test(l) && !/^\s*"[^"]+":\s*"latest",?\s*$/.test(l));
      if (odd.length) problems.push(`package.json changes more than dependency versions: ${odd[0].trim().slice(0, 60)}`);
    }
    for (const line of f.added)
      for (const [re, name] of DANGEROUS)
        if (re.test(line)) problems.push(`${f.path} adds ${name}: ${line.trim().slice(0, 80)}`);
  }
  return [...new Set(problems)];
}

export function parseDiff(text: string): FileDiff[] {
  const files: FileDiff[] = [];
  let cur: FileDiff | null = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      cur = { path: "", status: "M", added: [], removed: [] };
      files.push(cur);
    } else if (!cur) continue;
    else if (line.startsWith("--- ") && !cur.path) { if (line !== "--- /dev/null") cur.path = line.slice(6); }
    else if (line.startsWith("+++ ")) { if (line !== "+++ /dev/null") cur.path = line.slice(6); }
    else if (line.startsWith("rename from ") && !cur.path) cur.path = line.slice(12);
    else if (line.startsWith("+")) cur.added.push(line.slice(1));
    else if (line.startsWith("-")) cur.removed.push(line.slice(1));
  }
  // Deleted/renamed files: path from the "diff --git a/x b/y" header is safer.
  return files.filter((f) => f.path);
}

function main() {
  const [base, head, branch] = process.argv.slice(2);
  if (!base || !head) throw new Error("usage: guardrail-check.ts <base> <head> <branch>");
  if (!branch?.startsWith("change/")) {
    console.log(`guardrail: ${branch} is not a change/* branch, skipped`);
    return;
  }
  const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  // Names first, so deleted/renamed files are never missed.
  const names = git("diff", "--name-status", "--no-renames", `${base}...${head}`)
    .split("\n").filter(Boolean).map((l) => l.split("\t")[1]);
  const diff = parseDiff(git("diff", "--no-renames", "-U0", `${base}...${head}`));
  const byPath = new Map(diff.map((f) => [f.path, f]));
  const files: FileDiff[] = names.map((p) => byPath.get(p) ?? { path: p, status: "M", added: [], removed: [] });
  const problems = check(files);
  const summary = problems.length
    ? `guardrail FAILED: ${problems.join("; ")}`
    : `guardrail ok: ${files.length} file(s) checked`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
  if (problems.length) process.exit(1);
}

if (process.argv[1]?.endsWith("guardrail-check.ts")) main();
