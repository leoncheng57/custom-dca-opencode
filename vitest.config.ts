import { defineConfig } from "vitest/config";

// Separate from vite.config.ts: the app's Vite root is client/, but unit
// tests live in tests/ at the repo root and exercise server code too.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
