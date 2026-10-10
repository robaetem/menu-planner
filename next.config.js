/** @type {import('next').NextConfig} */
const nextConfig = {
  // Extra hosts allowed to load dev resources (HMR), e.g. a remote dev box: comma-separated.
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean),
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
}

module.exports = nextConfig
