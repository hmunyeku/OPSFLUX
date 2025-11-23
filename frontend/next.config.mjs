/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Disable automatic trailing slash redirect for API routes
  skipTrailingSlashRedirect: true,
  // Force new build ID to invalidate browser cache
  generateBuildId: async () => {
    return 'build-' + Date.now();
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // API proxy is handled by app/api/v1/[...path]/route.ts
  // This ensures proper proxying in standalone mode without redirects
}

export default nextConfig
