import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Centralized server-side Supabase access.
//
// Production path (unchanged from the scaffold): a client that injects the
// Clerk session token, so Supabase RLS runs as the `authenticated` role.
//
// Local-dev path: when DEV_AUTH_BYPASS=1 and a SUPABASE_SECRET_KEY is present
// (both ONLY ever live in the gitignored .env.local, never on Vercel), use the
// secret key, which bypasses RLS. This lets the app be driven end-to-end in a
// browser without a real Google sign-in. It must NEVER be enabled in production.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY;

export const DEV_BYPASS =
  process.env.DEV_AUTH_BYPASS === "1" && !!secretKey;

export function getDb(): SupabaseClient {
  if (DEV_BYPASS) {
    return createClient(url, secretKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return createClient(url, publishableKey, {
    auth: { persistSession: false },
    async accessToken() {
      return (await auth()).getToken();
    },
  });
}
