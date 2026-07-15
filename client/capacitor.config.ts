import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor native shell config for CoinCompass (Android + iOS).
 *
 * The web app is built to `dist/` and bundled into each native project. Because
 * the app is served from `https://localhost` (Android) / `capacitor://localhost`
 * (iOS), API calls are cross-origin — build the web app with VITE_API_BASE_URL
 * pointing at your deployed HTTPS API before `cap copy` (see MOBILE.md).
 */
const config: CapacitorConfig = {
  appId: "com.coincompass.app",
  appName: "CoinCompass",
  webDir: "dist",
  backgroundColor: "#0F172A", // matches the PWA theme/background color
  server: {
    androidScheme: "https", // secure context — required for cookies & crypto APIs
    // Live-reload during development: point the shell at the running Vite dev
    // server on your LAN. Set CAP_SERVER_URL (e.g. http://192.168.1.20:5173),
    // run `vite` with `--host`, then `npx cap run android`.
    ...(process.env.CAP_SERVER_URL
      ? { url: process.env.CAP_SERVER_URL, cleartext: true }
      : {}),
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: false, // we hide it from JS once the app has mounted
      backgroundColor: "#0F172A",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
  },
};

export default config;
