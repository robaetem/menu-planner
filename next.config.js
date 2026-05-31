/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit middleware as a Node.js function (not an Edge function) so Clerk's
  // Node-only modules work. Required alongside `export const runtime = "nodejs"`
  // in middleware.ts for Vercel's builder to honor the Node runtime.
  experimental: {
    nodeMiddleware: true,
  },
}

module.exports = nextConfig
