import { defineConfig } from "vitest/config";
import path from "node:path";

// Dedicated config for unit tests: resolves the "@" alias like the app does, but
// skips the React/PWA plugins so pure-logic tests (lib/*) run fast and isolated.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
