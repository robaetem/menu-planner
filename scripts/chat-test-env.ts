/* Test setup for scripts/test-chat-tools.ts. Only with CHAT_TEST_LOCAL_DB=1:
 * points the app at the LOCAL Supabase from .env.local (refuses anything that
 * is not localhost, so tests never write to production) and stubs next/cache,
 * which only works inside a Next request. Must be imported first. */
import { readFileSync } from "node:fs";
import Module from "node:module";

export const LOCAL_DB = process.env.CHAT_TEST_LOCAL_DB === "1";

if (LOCAL_DB) {
  const dir = process.env.MENU_PLANNER_ENV_DIR ?? "/home/robin/Documents/menu-planner";
  const env: Record<string, string> = {};
  for (const line of readFileSync(`${dir}/.env.local`, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  // Local = this machine (loopback or the devbox's own tailnet address) on the
  // supabase CLI port. Always talk to it over loopback.
  const local = /^http:\/\/(127\.0\.0\.1|localhost|100\.123\.162\.82):54321\/?$/.test(url);
  if (!local) throw new Error(`Refusing: .env.local Supabase is not the local supabase CLI (${new URL(url).host})`);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_SECRET_KEY = env.SUPABASE_SECRET_KEY;
  process.env.DEV_AUTH_BYPASS = "1";
  process.env.OPENROUTER_API_KEY = ""; // shopping categorisation falls back to Overig

  const M = Module as unknown as { _load: (req: string, ...rest: unknown[]) => unknown };
  const load = M._load;
  M._load = function (req: string, ...rest: unknown[]) {
    if (req === "next/cache") return { revalidatePath() {}, revalidateTag() {}, unstable_cache: (f: unknown) => f };
    return load.call(this, req, ...rest);
  };
}
