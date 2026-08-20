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
  // serverExternalPackages alone isn't enough under Turbopack: its output
  // tracer can't statically follow sharp's platform-detection require() to
  // find the compiled @img/sharp-linux-x64 / libvips .so files, so they get
  // dropped from the deployed function and dlopen fails at runtime. Force
  // them into every function's bundle explicitly. (lib/action-plan-pdf.ts is
  // imported transitively by app/actions/ai-actions.ts, a shared "use server"
  // module pulled in by most routes, so scope this broadly rather than to
  // one page.)
  outputFileTracingIncludes: {
    "/**/*": ["./node_modules/@img/**/*", "./node_modules/sharp/**/*"],
  },
};

export default nextConfig;
