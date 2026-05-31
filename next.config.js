/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't fail the production build on lint (eslint-config-next version is
  // pinned older than Next; lint isn't required to deploy).
  eslint: {
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
