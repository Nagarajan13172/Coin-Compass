import { defineConfig, devices } from "@playwright/test";
import { CLIENT_DIR } from "./src/harness/config";

/**
 * E2E layer. The real backend + ephemeral Mongo are booted in global-setup.ts;
 * Playwright itself launches the client dev server (pointed at the test API) and
 * drives it in a browser. Emits an HTML report under reports/e2e/.
 */
// Dedicated ports so E2E never collides with (or reuses) your running dev stack.
const CLIENT_PORT = process.env.TEST_CLIENT_PORT ?? "5290";
const CLIENT_URL = `http://127.0.0.1:${CLIENT_PORT}`;
const API_PORT = process.env.TEST_SERVER_PORT ?? "4599";

export default defineConfig({
  testDir: "./src/e2e",
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  globalSetup: "./src/e2e/global-setup.ts",
  globalTeardown: "./src/e2e/global-teardown.ts",
  reporter: [["list"], ["html", { outputFolder: "reports/e2e", open: "never" }]],
  outputDir: "reports/e2e-artifacts",
  use: {
    baseURL: CLIENT_URL,
    serviceWorkers: "block", // the app registers a PWA SW in dev; block it for deterministic runs
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Own port + never reuse an existing server, so we don't accidentally hit
    // your running dev vite (which proxies to your dev DB, not the test DB).
    command: `npm run dev -- --port ${CLIENT_PORT} --strictPort`,
    cwd: CLIENT_DIR,
    url: CLIENT_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      // Proxy the client's /api to the ephemeral test backend global-setup boots.
      VITE_API_PROXY: `http://127.0.0.1:${API_PORT}`,
    },
  },
});
