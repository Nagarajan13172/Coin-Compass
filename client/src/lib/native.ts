import { Capacitor } from "@capacitor/core";

/**
 * Native-shell bootstrap. Every call here is guarded by `isNativePlatform()`
 * and dynamically imports its plugin, so this module is a complete no-op (and
 * adds no plugin code to the bundle at runtime) when the app runs on the web.
 *
 * Wire the returned promise from `main.tsx` — it must never reject in a way that
 * blocks the app, so each step is best-effort.
 */
export const isNative = Capacitor.isNativePlatform();

export async function initNative(): Promise<void> {
  if (!isNative) return;

  // Status bar: dark theme, don't overlay the web content.
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0F172A" });
  } catch {
    /* status bar unavailable (e.g. iOS handles some of this natively) */
  }

  // Android hardware back button: let the browser history handle it, and only
  // exit the app when there's nowhere left to go back to.
  try {
    const { App } = await import("@capacitor/app");
    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        void App.exitApp();
      }
    });
  } catch {
    /* @capacitor/app unavailable */
  }
}

/** Hide the native splash once the first paint is done. Safe to call on web. */
export async function hideSplash(): Promise<void> {
  if (!isNative) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    /* splash screen unavailable */
  }
}
