/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Force new build ID to invalidate browser cache
  generateBuildId: async () => {
    return 'build-' + Date.now();
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Proxy API requests to backend
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.opsflux.io';

    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
}

export default nextConfig
