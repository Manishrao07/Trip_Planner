import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the trace root to this project — an unrelated lockfile in the home
  // directory otherwise makes Next guess wrong and warn on every build.
  outputFileTracingRoot: __dirname,
  experimental: {
    // The itinerary route streams for up to ~60s; keep the proxy from buffering.
    proxyTimeout: 90_000,
  },
};

export default nextConfig;
