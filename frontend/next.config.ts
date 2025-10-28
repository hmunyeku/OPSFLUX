import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Optionnel: désactiver les telemetry Next.js
  experimental: {
    instrumentationHook: false,
  },
};

export default nextConfig;
