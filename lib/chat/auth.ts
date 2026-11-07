import { currentUser } from "@clerk/nextjs/server";
import { DEV_BYPASS } from "@/lib/supabase/server";

// Same household allowlist as app/(protected)/layout.tsx, for API routes.
// Fail-closed: no email or an empty ALLOWED_EMAILS means 403.
function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export type AuthResult = { ok: true; email: string } | { ok: false; response: Response };

export async function requireHousehold(): Promise<AuthResult> {
  if (DEV_BYPASS) return { ok: true, email: "dev@local" };
  const user = await currentUser();
  if (!user) return { ok: false, response: Response.json({ error: "Niet ingelogd" }, { status: 401 }) };
  const email = user.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (!email || !allowedEmails().includes(email)) {
    return { ok: false, response: Response.json({ error: "Geen toegang" }, { status: 403 }) };
  }
  return { ok: true, email };
}
