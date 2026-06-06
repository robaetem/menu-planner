import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";

// Next.js 16 renamed `middleware.ts` -> `proxy.ts`, which runs on the Node.js
// runtime (Edge is not an option here). That's deliberate: Clerk's middleware
// uses Node-only modules that the Edge runtime rejects on Vercel.
//
// We protect the app routes (redirect anonymous visitors to Clerk sign-in); the
// ALLOWED_EMAILS allowlist is enforced afterwards in app/(protected)/layout.tsx.
// In local dev, DEV_AUTH_BYPASS=1 turns auth off entirely: Clerk's middleware is
// never invoked (avoids its dev handshake/redirect churn) and the data layer
// uses the Supabase secret key. Never enabled in production.

const DEV_BYPASS = process.env.DEV_AUTH_BYPASS === "1";
const isProtected = createRouteMatcher(["/", "/planning(.*)", "/recepten(.*)"]);

const clerk = clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect();
});

export default function proxy(req: NextRequest, ev: NextFetchEvent) {
  if (DEV_BYPASS) return;
  return clerk(req, ev);
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Always run for Clerk-specific frontend API routes
    "/__clerk/(.*)",
  ],
};
