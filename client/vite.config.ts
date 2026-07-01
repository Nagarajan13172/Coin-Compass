import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true, // expose on the local network (0.0.0.0) — prints a Network URL
    port: 5173,
    strictPort: true, // OAuth redirect URIs are exact, so silently shifting ports breaks sign-in.
    proxy: {
      "/api": {
        // Keep /api on the same browser origin as the app so auth cookies and
        // OAuth callbacks round-trip through the Vite proxy consistently.
        target: process.env.VITE_API_PROXY ?? "http://localhost:4000",
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"],
          motion: ["motion"],
          query: ["@tanstack/react-query"],
        },
      },
    },
  },
});
