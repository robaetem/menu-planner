import { clerkMiddleware } from "@clerk/nextjs/server";

// Next.js 16 renamed `middleware.ts` -> `proxy.ts`, which runs on the Node.js
// runtime (Edge is not an option here). That's deliberate: Clerk's middleware
// uses Node-only modules that the Edge runtime rejects on Vercel.
// Access control (the ALLOWED_EMAILS allowlist) is enforced in
// app/(protected)/layout.tsx.
export default clerkMiddleware();

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
