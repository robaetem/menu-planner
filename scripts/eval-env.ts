/* Shared setup for chat eval scripts: PRODUCTION Supabase, READ-ONLY.
 * Loads .env.prod.local (Supabase) and .env.local (OpenRouter) from the main checkout,
 * and wraps fetch so any non-GET request to Supabase throws. Never prints secrets. */
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";

function parse(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const ROOT = process.env.MENU_PLANNER_ENV_DIR ?? "/home/robin/Documents/menu-planner";
const prod = parse(`${ROOT}/.env.prod.local`);
const local = parse(`${ROOT}/.env.local`);
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"]) {
  if (!prod[k]) throw new Error(`missing ${k} in .env.prod.local`);
  process.env[k] = prod[k];
}
process.env.DEV_AUTH_BYPASS = "1";
process.env.OPENROUTER_API_KEY = local.OPENROUTER_API_KEY;
if (!process.env.GITHUB_REPO_TOKEN) {
  try {
    process.env.GITHUB_REPO_TOKEN = execSync("gh auth token", {
      env: { ...process.env, GH_CONFIG_DIR: `${process.env.HOME}/.config/gh-robaetem` },
    }).toString().trim();
  } catch {}
}

// Read-only guard: Supabase may only see GET/HEAD.
const SUPA = prod.NEXT_PUBLIC_SUPABASE_URL;
const realFetch = globalThis.fetch;
export const writeAttempts: string[] = [];
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input?.url ?? String(input);
  const method = String(init?.method ?? (typeof input === "object" ? input?.method : undefined) ?? "GET").toUpperCase();
  if ((url.startsWith(SUPA) || url.startsWith("https://api.github.com")) && method !== "GET" && method !== "HEAD") {
    writeAttempts.push(`${method} ${new URL(url).pathname}`);
    throw new Error(`READ-ONLY GUARD: blocked ${method} ${new URL(url).pathname}`);
  }
  return realFetch(input, init);
}) as typeof fetch;
