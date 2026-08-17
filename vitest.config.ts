import path from "path";
import { defineConfig } from "vitest/config";

/**
 * Dedicated Vitest config, separate from the legacy vite.config.ts (which
 * targets @vitejs/plugin-react — not installed — and predates the move to
 * Next.js). Tests run against plain TypeScript modules under lib/, so no
 * React/JSX plugin is needed here.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
