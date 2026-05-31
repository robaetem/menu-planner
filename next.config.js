/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow middleware.ts to opt into the Node.js runtime (`export const runtime`).
  experimental: {
    nodeMiddleware: true,
  },
}

module.exports = nextConfig
