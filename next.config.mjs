/** @type {import('next').NextConfig} */
// Cloudflare Pages serves the static export from `out/`. Railway (the fallback
// deployment) needs the standalone server build and auto-injects
// RAILWAY_ENVIRONMENT at build time, so it keeps working without any changes.
const isRailwayBuild = Boolean(process.env.RAILWAY_ENVIRONMENT)

const nextConfig = {
  output: isRailwayBuild ? 'standalone' : 'export',
  // Static export has no image optimization server. The only next/image use is
  // a small pre-sized logo PNG, so serving it unoptimized is visually identical.
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
