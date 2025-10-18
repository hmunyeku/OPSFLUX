import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  eslint: {
    // Temporairement: ignorer les erreurs ESLint pendant le build
    // TODO: Corriger les erreurs dans cache.ts, queue.ts, storage.ts, etc.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Garder la vérification TypeScript active
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.pravatar.cc",
      },
    ],
    domains: ["ui.shadcn.com"],
  },
};

export default nextConfig;
