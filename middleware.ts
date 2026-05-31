import {
  clerkClient,
  clerkMiddleware,
  createRouteMatcher,
} from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Private app: only the email addresses listed in ALLOWED_EMAILS may use it.
// Comma-separated, case-insensitive. Fail-closed: if the env var is missing
// or empty, everyone is blocked.
function getAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

const isUnauthorizedRoute = createRouteMatcher(["/unauthorized"]);

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth();

  // Not signed in: nothing to gate — Clerk's UI handles sign-in.
  if (!userId) return NextResponse.next();

  // Avoid a redirect loop on the page we redirect blocked users to.
  if (isUnauthorizedRoute(req)) return NextResponse.next();

  // Resolve the user's primary email. Prefer the custom session-token claim
  // (fast, no API call); fall back to the Backend API so the gate can't
  // silently fail if that claim isn't configured in the Clerk dashboard.
  let email = sessionClaims?.primaryEmail?.toLowerCase();
  if (!email) {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    email = user.primaryEmailAddress?.emailAddress?.toLowerCase();
  }

  if (!email || !getAllowedEmails().includes(email)) {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
