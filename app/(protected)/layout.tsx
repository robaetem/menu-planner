import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DEV_BYPASS } from "@/lib/supabase/server";

// Private app: only the emails listed in ALLOWED_EMAILS may reach these pages.
// Comma-separated, case-insensitive. Fail-closed. In local dev DEV_AUTH_BYPASS
// skips the Clerk check entirely (see lib/supabase/server.ts) — never in prod.
function getAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!DEV_BYPASS) {
    // proxy.ts already guarantees the visitor is signed in; here we enforce the
    // household allowlist.
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
    if (!email || !getAllowedEmails().includes(email)) {
      redirect("/unauthorized");
    }
  }

  return <AppShell devBypass={DEV_BYPASS}>{children}</AppShell>;
}
