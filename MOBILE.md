# CoinCompass — Mobile (Capacitor)

> 📋 **Full step-by-step implementation plan & runbook:**
> [`docs/mobile-implementation-plan.md`](docs/mobile-implementation-plan.md).
> To resume work in a fresh chat: _"Read `docs/mobile-implementation-plan.md` and
> continue from the first unchecked task."_ This file below is the quick reference.

CoinCompass ships to Android + iOS by wrapping the existing React/Vite web app
with [Capacitor](https://capacitorjs.com). The web UI is reused as-is; only the
native shell, auth transport, and a few native plugins are added on top.

- **App name:** CoinCompass
- **Bundle ID:** `com.coincompass.app` _(permanent after first store release — change now if needed)_
- **Web build dir:** `client/dist` (Capacitor `webDir`)
- **Platforms scaffolded:** Android (iOS added later via cloud Mac CI)

---

## Prerequisites

| Tool | Why | Status |
|------|-----|--------|
| Node 20+ / npm | build the web app | ✅ present |
| JDK 17 | Android Gradle build | ✅ present |
| [Android Studio](https://developer.android.com/studio) + SDK | build/run Android, emulator | ⛔ **install this** |
| Deployed HTTPS API | phone can't reach `localhost:4000` | ⛔ deploy the `server/` |
| Apple Developer ($99/yr) + cloud Mac CI ([Codemagic](https://codemagic.io)) | iOS builds (you're on Windows) | later |

After installing Android Studio, set `ANDROID_HOME` and add `platform-tools` to PATH.

---

## Commands (run from `client/`)

```bash
npm run cap:sync        # build web + copy into native projects + update plugins
npm run cap:copy        # build web + copy only (faster, no plugin update)
npm run android:open    # open the Android project in Android Studio
npm run android:run     # build & run on a connected device / emulator
```

Live-reload during dev (device on same Wi-Fi):
```bash
# terminal 1
npm run dev -- --host                 # note the Network URL, e.g. http://192.168.1.20:5173
# terminal 2
CAP_SERVER_URL=http://192.168.1.20:5173 npx cap run android
```

## Pointing at your API (required for login to work)

The bundled web build calls `/api` (same-origin) by default, which doesn't exist
inside the native shell. Build with the deployed API URL before syncing:

```bash
# client/.env.production (or inline)
VITE_API_BASE_URL=https://api.your-domain.com/api
npm run cap:sync
```

---

## Roadmap / follow-ups (tracked, not yet done)

1. **Native auth transport.** Add a Bearer-token login path on the server
   alongside the existing cookie session; store the token in Keychain/Keystore
   via a secure-storage plugin. Cross-origin cookies from `https://localhost` are
   fragile in native WebViews. (Biggest task.)
2. **Service worker in native.** `vite-plugin-pwa` emits `dist/sw.js`, which gets
   bundled into the app. Disable SW registration when `Capacitor.isNativePlatform()`
   (set `injectRegister: null` and register manually behind a native guard) to
   avoid stale-asset/update issues — Capacitor already serves assets locally.
3. **OAuth deep links.** Native Google/OAuth via `@capacitor/browser` + a custom
   URL scheme (`coincompass://auth/callback`) with matching provider redirect URIs.
4. **Push notifications.** Wire the existing server notifications to FCM (Android)
   + APNs (iOS); add a device-token registration endpoint.
5. **Biometric unlock.** Upgrade the existing PIN/Wealth lock with device biometrics.
6. **CORS.** Restrict server CORS to the native origins + web origin.
7. **iOS.** `npx cap add ios` on a Mac / cloud CI, then set up signing + TestFlight.

---

## What was scaffolded

- Capacitor core + CLI + Android platform (`client/android/`)
- Baseline plugins: `app`, `status-bar`, `splash-screen`, `keyboard`, `preferences`, `haptics`
- `client/capacitor.config.ts` — bundle ID, splash, `https` scheme, dev live-reload hook
- `client/src/lib/native.ts` — native-only bootstrap (status bar, Android back button, splash hide); a no-op on web
- npm scripts above
