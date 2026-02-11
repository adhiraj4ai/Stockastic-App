import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  output: 'standalone', // For Docker deployment
  typescript: {
    // Disable type checking during build (for Docker)
    ignoreBuildErrors: true,
  },
  eslint: {
    // Disable linting during build to speed up Docker builds
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
