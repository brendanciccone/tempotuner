/** @type {import('next').NextConfig} */
const nextConfig = {
  // 'standalone' is kept for the Railway fallback deployment (run with
  // `node .next/standalone/server.js`). Vercel ignores the `output` setting
  // and builds its own serverless output, so this is safe to leave in place.
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
