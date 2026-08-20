import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Disable dev indicators that can cause SegmentViewNode errors in dev mode
  devIndicators: false,
  // sharp is a native module (per-OS compiled binaries). Without this, Next's
  // Turbopack build bundles it instead of tracing its platform binary, which
  // works locally (Windows) but fails to dlopen libvips on Vercel's linux-x64
  // runtime. Keeping it external lets Next resolve + trace the real linux
  // binary from node_modules at deploy time.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
