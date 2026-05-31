import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

// Private app: only the emails listed in ALLOWED_EMAILS may reach these pages.
// Comma-separated, case-insensitive. Fail-closed: if the var is missing or
// empty, every signed-in user is redirected to /unauthorized.
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
  const user = await currentUser();

  // Signed-in users must be on the allowlist. Anonymous visitors fall through
  // and see the page's own "Sign in" prompt.
  if (user) {
    const email = user.primaryEmailAddress?.emailAddress?.toLowerCase();
    if (!email || !getAllowedEmails().includes(email)) {
      redirect("/unauthorized");
    }
  }

  return <>{children}</>;
}
