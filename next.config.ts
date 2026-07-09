import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Disable dev indicators that can cause SegmentViewNode errors in dev mode
  devIndicators: false,
};

export default nextConfig;
