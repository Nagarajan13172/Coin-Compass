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
    proxy: {
      "/api": {
        // Vite runs on the dev machine, so localhost:4000 resolves correctly
        // even when the client is opened from another device on the LAN.
        target: process.env.VITE_API_PROXY ?? "http://localhost:4000",
        changeOrigin: true,
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
