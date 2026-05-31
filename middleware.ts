import { clerkMiddleware } from "@clerk/nextjs/server";

// Provides Clerk auth context to the app. Access control (the email allowlist)
// is enforced server-side in app/(protected)/layout.tsx, where Clerk's Node
// APIs are available — middleware runs on the Edge runtime and can't use them.
export default clerkMiddleware();

// Run middleware on the Node.js runtime (stable since Next.js 15.5). Clerk's
// middleware pulls in Node-only modules (#crypto, #safe-node-apis) that the
// Edge runtime rejects on Vercel CLI deploys (vercel/vercel#13248).
export const runtime = "nodejs";

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
