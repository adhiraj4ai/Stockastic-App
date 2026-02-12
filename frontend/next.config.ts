import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  output: 'standalone', // For Docker deployment
  typescript: {
    // Disable type checking during build (for Docker)
    ignoreBuildErrors: true,
  },

};

export default nextConfig;
