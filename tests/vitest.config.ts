import { defineConfig } from "vitest/config";

/**
 * API layer config. One shared stack (ephemeral Mongo + the real server) is
 * booted once by the global setup, then every spec drives it over HTTP.
 * Runs single-threaded so the shared server/DB stays deterministic, and emits
 * a browsable HTML report per run under reports/api/.
 */
export default defineConfig({
  test: {
    include: ["src/api/**/*.spec.ts"],
    globalSetup: ["src/harness/globalSetup.ts"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    reporters: ["default", "html"],
    outputFile: { html: "./reports/api/index.html" },
  },
});
