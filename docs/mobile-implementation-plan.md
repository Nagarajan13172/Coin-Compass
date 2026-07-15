# CoinCompass Mobile — Implementation Plan & Runbook

**Purpose:** a self-contained spec for turning CoinCompass into native Android + iOS
apps with Capacitor. This doc is the source of truth. If the working chat is lost,
point a fresh session at it.

> **Resume prompt (paste this in a new chat):**
> _"Read `docs/mobile-implementation-plan.md` and continue the mobile implementation
> from the first unchecked task. Re-verify the checklist against the current code
> before making changes."_

**Legend:** ✅ done · 🔜 next · ⬜ not started · ⚠️ needs my action (Sathish) · ☁️ needs deploy

---

## 0. Status checklist (update as you go)

- [x] **Phase 0 — Scaffold** (Capacitor + Android project + baseline plugins) ✅
- [ ] **Phase 1 — Native auth transport** (Bearer token) 🔜 ← _start here_
- [ ] **Phase 2 — Point mobile build at prod API + disable service worker on native**
- [ ] **Phase 3 — Native UX** (biometric unlock, keyboard/insets polish)
- [ ] **Phase 4 — OAuth deep links** (Google etc. in native)
- [ ] **Phase 5 — Push notifications** (FCM + APNs)
- [ ] **Phase 6 — Android build & Google Play release**
- [ ] **Phase 7 — iOS** (cloud Mac CI + App Store / TestFlight)

---

## 1. Context (everything a fresh session needs)

**App:** CoinCompass — full-stack personal expense/budget tracker.
**Repo layout:** `client/` (web app), `server/` (API). Monorepo, npm workspaces-ish (`--prefix`).
**Branch for this work:** `feat/mobile-capacitor` (do not merge to `main` until Phase 1–2 verified).

**Stack**
- Client: React 18, Vite 6, TypeScript, Tailwind, Radix (shadcn), TanStack Query, Zustand, i18next (incl. Tamil), axios, Recharts, motion. Already a PWA (`vite-plugin-pwa`) with a mobile-first `BottomNav` + FAB and `env(safe-area-inset-*)`.
- Server: Express 4, MongoDB/Mongoose, JWT session in an httpOnly cookie, OAuth (arctic), 2FA (TOTP + email OTP + backup codes), email verify, password reset.

**Chosen approach:** **Capacitor** (wrap the existing web app), **not** React Native. Rationale: it's a forms/lists/charts CRUD app already built mobile-first — Capacitor reuses ~100% of the UI. Android-first because dev machine is **Windows** (Android builds locally; iOS needs a Mac/cloud CI).

**Identity**
- App name: `CoinCompass`
- Bundle ID: `com.coincompass.app` (⚠️ permanent after first store release — change now if ever)

**Production (already live, web)**
- Site + API same origin: `https://coincompass.sathishkumar.cloud`
- API base path: `https://coincompass.sathishkumar.cloud/api`
- FE and BE are served from the **same origin** (server serves the built client from `server/public`, see [server/src/index.ts](../server/src/index.ts) L41–50).

---

## 2. Key findings & why native needs work

The web app works because **FE and BE are same-origin**, so cookies "just work" and CORS
is never enforced. A Capacitor app is served from `https://localhost` (Android) /
`capacitor://localhost` (iOS), so **every API call is cross-origin**. Verified against the
live API on 2026-07-15:

| Check | Result | Implication for native |
|---|---|---|
| `GET /api/auth/me` (no session) | `401` | API reachable, base path confirmed |
| CORS `Access-Control-Allow-Origin` for **any** origin | fixed `http://localhost:4000` | native origin rejected → responses unreadable |
| Session cookie flags ([server/src/auth/cookie.ts](../server/src/auth/cookie.ts)) | `httpOnly; Secure; SameSite=Lax` | `Lax` cookie is **not sent** on cross-origin XHR → login won't persist |

**Conclusion:** a native build pointed at prod today loads the login screen, then **fails to
authenticate**. Two independent blockers: (1) CORS allowlist, (2) `SameSite=Lax` cookie.

**Fix = token-based auth for native** (additive; web stays on cookies untouched):
- Server also returns the JWT in the login/2FA response body **when the caller is native**, and `requireAuth` also accepts `Authorization: Bearer`.
- Client stores the token in Keychain/Keystore and attaches it as a Bearer header on native.
- CORS allows the native origins.

Other findings:
- **Service worker:** `vite-plugin-pwa` emits `dist/sw.js` which gets bundled into the app. Must be disabled on native (Capacitor already serves assets locally) to avoid stale-asset/update loops. (Phase 2)
- **Prod `CLIENT_URL` looks set to `http://localhost:4000`** (that's what CORS echoes). Harmless for the same-origin web app, but should be corrected to `https://coincompass.sathishkumar.cloud`. Fix while doing Phase 1 CORS. ⚠️☁️

---

## 3. Prerequisites & accounts

| Item | For | Status |
|---|---|---|
| Node 20+ / npm | build | ✅ present (Node 24) |
| JDK 17 | Android Gradle | ✅ present |
| [Android Studio](https://developer.android.com/studio) + SDK, set `ANDROID_HOME` | build/run Android | ⚠️ **install** |
| Deployed HTTPS API | phone reaches backend | ✅ live |
| Google Play Developer ($25 one-time) | Phase 6 | ⚠️ later |
| Apple Developer ($99/yr) + cloud Mac CI ([Codemagic](https://codemagic.io)) | Phase 7 | ⚠️ later |
| Firebase project (FCM) | Phase 5 push | ⚠️ later |

---

## 4. Phase 0 — Scaffold ✅ (DONE)

Already committed to the working tree on `feat/mobile-capacitor`:
- Capacitor 8: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` + Android project at `client/android/`.
- Baseline plugins: `app`, `status-bar`, `splash-screen`, `keyboard`, `preferences`, `haptics`.
- [client/capacitor.config.ts](../client/capacitor.config.ts) — bundle ID, dark splash, `https` android scheme, `CAP_SERVER_URL` live-reload hook.
- [client/src/lib/native.ts](../client/src/lib/native.ts) — native-only bootstrap (status bar, Android back button, splash hide); no-op on web. Wired in [client/src/main.tsx](../client/src/main.tsx).
- npm scripts in `client/package.json`: `cap:sync`, `cap:copy`, `android:open`, `android:run`.
- `npx cap doctor` → "Android looking great 👌"; web assets confirmed bundled into `android/app/src/main/assets/public/`.

---

## 5. Phase 1 — Native auth transport 🔜 (START HERE)

**Goal:** native app logs in against prod using a Bearer token; web is unchanged.

**Design:** the client sends header `X-Client-Platform: native` on native. The server
returns the JWT in the response body **only when that header is present** (so the web keeps
its httpOnly-cookie protection). `requireAuth` accepts the token from cookie **or** Bearer header.

### 5a. Server (in `server/`) ☁️ (must redeploy after)

1. **Accept Bearer in `requireAuth`** — [server/src/middleware/auth.ts](../server/src/middleware/auth.ts) L19–26:
   ```ts
   export function requireAuth(req: Request, _res: Response, next: NextFunction) {
     const header = req.headers.authorization;
     const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
     const token = req.cookies?.[env.auth.cookieName] ?? bearer;
     const session = token ? verifySession(token) : null;
     if (!session) throw new HttpError(401, "Not authenticated");
     req.userId = session.sub;
     req.mode = session.mode;
     next();
   }
   ```

2. **Issue the token to native callers.** Add a helper next to `setSessionCookie`
   ([server/src/auth/cookie.ts](../server/src/auth/cookie.ts)) or in the controller:
   ```ts
   // true when the request comes from the Capacitor shell
   export const isNativeClient = (req: Request) =>
     req.get("x-client-platform") === "native";
   ```
   Then in [server/src/controllers/authController.ts](../server/src/controllers/authController.ts),
   every place that calls `setSessionCookie(res, uid, mode, remember)` and returns a `user`,
   also include the raw token in the body **for native only**. The token string comes from
   `signSession(uid, mode, remember)` ([server/src/auth/jwt.ts](../server/src/auth/jwt.ts)).
   Simplest: a small wrapper that returns the response payload:
   ```ts
   function sessionPayload(req, res, uid, mode, remember, user) {
     setSessionCookie(res, uid, mode, remember);          // web
     const body: any = { user };
     if (isNativeClient(req)) body.token = signSession(uid, mode, remember); // native
     return body;
   }
   ```
   Apply in: `signin` (non-2FA branch, L147), `verifyTwoFactor` (L178), `signup` (L82),
   `verifyEmail` (L100), `resetPassword` (L124), `unlockWealth` (L250), `lockWealth` (L259).
   > **Mode changes:** `unlockWealth`/`lockWealth` re-issue with a new `mode`, so native must
   > **replace** its stored token with the new one from each response.

3. **2FA pending step for native.** `signin` for a 2FA account sets an `mt_2fa` cookie and
   returns `{requires2fa:true}` (L141–144); the follow-up `/auth/2fa/*` calls read that cookie
   (`readPending`, L64–70). Native cookies won't round-trip, so:
   - In `signin`, when `isNativeClient`, also return `pendingToken` in the body (the value from `setPendingCookie`; refactor it to also return the signed pending token).
   - In `readPending`, accept the pending token from header `X-2FA-Pending` (or Bearer-style) in addition to the cookie.
   - Client stores `pendingToken` in memory between the two 2FA calls and sends it as that header.

4. **Logout** — `clearSessionCookie` is enough for web; native just deletes its stored token
   (client side). No server change required, but the endpoint should still 200.

5. **CORS** — [server/src/index.ts](../server/src/index.ts) L30. Replace the single-origin string
   with an allowlist that includes the native origins:
   ```ts
   const allowedOrigins = [
     env.clientUrl,                 // web (set CLIENT_URL to the real https origin!)
     "https://coincompass.sathishkumar.cloud",
     "https://localhost",           // Capacitor Android (androidScheme: https)
     "capacitor://localhost",       // Capacitor iOS
     "http://localhost",            // some Android WebView contexts / dev
   ];
   app.use(cors({
     origin(origin, cb) {
       // allow same-origin/native (no Origin header) and any allow-listed origin
       if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
       cb(new Error(`CORS: origin ${origin} not allowed`));
     },
     credentials: true,
   }));
   ```
   Also set prod env `CLIENT_URL=https://coincompass.sathishkumar.cloud` (fixes the localhost:4000 leak). ⚠️☁️

6. **Redeploy the server.** Native auth only works once prod runs the new code. ☁️

**Server acceptance test (curl):**
```bash
BASE=https://coincompass.sathishkumar.cloud/api
# 1) native login returns a token in the body:
curl -s -X POST $BASE/auth/signin -H "Content-Type: application/json" \
  -H "X-Client-Platform: native" \
  -d '{"email":"YOU@example.com","password":"...","remember":true}' | jq '.token'
# 2) that token authenticates via Bearer:
curl -s $BASE/auth/me -H "Authorization: Bearer <token-from-step-1>" | jq '.user.email'
# 3) web response has NO token (no native header):
curl -s -X POST $BASE/auth/signin -H "Content-Type: application/json" \
  -d '{...}' | jq 'has("token")'   # → false
```

### 5b. Client (in `client/`)

1. **Secure token store.** Install a Keychain/Keystore plugin (Preferences is plaintext — not for tokens):
   ```bash
   cd client && npm install @aparajita/capacitor-secure-storage
   ```
   New file `client/src/lib/authToken.ts`:
   ```ts
   import { isNative } from "@/lib/native";
   const KEY = "cc_session_token";
   // web: no-op (cookie handles auth). native: Keychain/Keystore.
   export async function saveToken(token: string) {
     if (!isNative) return;
     const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
     await SecureStorage.set(KEY, token);
   }
   export async function getToken(): Promise<string | null> {
     if (!isNative) return null;
     const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
     return (await SecureStorage.get(KEY)) as string | null;
   }
   export async function clearToken() {
     if (!isNative) return;
     const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
     await SecureStorage.remove(KEY).catch(() => {});
   }
   ```

2. **axios interceptors** — [client/src/lib/api.ts](../client/src/lib/api.ts):
   - Request interceptor: on native, set `Authorization: Bearer <getToken()>` and
     `X-Client-Platform: native`.
   - Keep `withCredentials: true` (harmless on native, required on web).
   - The existing 401 → `/login` interceptor stays; on native also `clearToken()`.
   ```ts
   api.interceptors.request.use(async (config) => {
     if (isNative) {
       config.headers.set("X-Client-Platform", "native");
       const t = await getToken();
       if (t) config.headers.set("Authorization", `Bearer ${t}`);
     }
     return config;
   });
   ```

3. **Persist token on auth success.** In the login / 2FA / signup mutations
   (`client/src/hooks/useAuth.ts` — the mutations behind LoginPage/TwoFactorPage/SignupPage),
   after a successful response call `saveToken(res.data.token)` when present. On `unlockWealth`/
   `lockWealth` responses, `saveToken` the new token (mode changed). On logout, `clearToken()`.
   For 2FA, hold `res.data.pendingToken` in memory and send it as `X-2FA-Pending` on the
   `/auth/2fa/verify` + `/auth/2fa/email` calls.

4. **Verify the build typechecks:** `cd client && npm run build`.

**Files touched (Phase 1):** server: `middleware/auth.ts`, `controllers/authController.ts`,
`auth/cookie.ts` (or new `auth/nativeSession.ts`), `auth/pending2fa.ts`, `index.ts`, prod env.
client: `lib/api.ts`, new `lib/authToken.ts`, `hooks/useAuth.ts`, `package.json`.

---

## 6. Phase 2 — Point mobile build at prod API + kill SW on native

1. **API base URL on native.** The bundled build defaults to `/api` (same-origin) which
   doesn't exist in the shell. Set it for the mobile build:
   - Create `client/.env.production` (gitignored) **or** pass inline:
     `VITE_API_BASE_URL=https://coincompass.sathishkumar.cloud/api`
   - Belt-and-braces: in [client/src/lib/api.ts](../client/src/lib/api.ts), when
     `Capacitor.isNativePlatform()` and no `VITE_API_BASE_URL`, fall back to the prod URL.
2. **Disable the service worker on native** — [client/vite.config.ts](../client/vite.config.ts):
   set `VitePWA({ injectRegister: null, ... })` and register manually in
   [client/src/main.tsx](../client/src/main.tsx) guarded by `if (!isNative)` using
   `import('virtual:pwa-register')`. This keeps the web PWA working and stops the SW from
   caching inside the app.
3. Rebuild + sync: `cd client && npm run cap:sync`.

**Verify:** browser device-mode (`npm run dev` from root, Chrome Ctrl+Shift+M) OR Android
shell → log in against prod → data loads.

---

## 7. Phase 3 — Native UX

- **Biometric unlock:** upgrade the existing PIN/Wealth lock ([client/src/features/settings/PinLock.tsx](../client/src/features/settings/PinLock.tsx), `WealthLock.tsx`) with device biometrics via a plugin (e.g. `@aparajita/capacitor-biometric-auth`). Gate behind `isNative`.
- **Keyboard insets / status bar / splash:** already partly handled in `native.ts`; verify forms aren't obscured by the keyboard (use `@capacitor/keyboard` events; add `resize` config if needed).
- **Haptics** on the FAB / key actions (optional polish).

---

## 8. Phase 4 — OAuth deep links

Native Google/GitHub/etc. can't use the web redirect. Plan:
- Install `@capacitor/browser`. Register a custom scheme (`coincompass://auth/callback`) in Android `AndroidManifest.xml` (and iOS `Info.plist` later).
- Open the provider URL with `Browser.open`; handle the redirect via `App.addListener('appUrlOpen', ...)` in `native.ts`; exchange for a session token.
- Register the native redirect URI with each provider console. Server: `oauthController.ts` may need to return the token in the body for native (same pattern as Phase 1).
- Simpler interim: hide social login on native (email/password only) and ship, add OAuth later.

---

## 9. Phase 5 — Push notifications

Server already has an in-app notification system (`notificationService.ts`, `Notification` model).
- Install `@capacitor/push-notifications`. Create a Firebase project; add `google-services.json` (Android) / APNs key (iOS).
- New endpoint: register device token → store per user (new `DeviceToken` model).
- Send path: on notification creation, also push via FCM (Android) / APNs (iOS).
- Ask permission on native after login.

---

## 10. Phase 6 — Android build & Google Play release

1. Install Android Studio, set `ANDROID_HOME`. ⚠️
2. `cd client && npm run android:open`; create an emulator or use a USB device (USB debugging on).
3. App icons + splash: use `@capacitor/assets` to generate from a source logo.
4. Signing: generate an upload keystore; configure `android/app/build.gradle` signing config (keep keystore OUT of git).
5. Build release AAB: `cd client/android && ./gradlew bundleRelease`.
6. Google Play Console: create app, internal testing track, upload AAB, privacy policy URL, data-safety form (finance app → declare data collected), submit.

> **No local Android Studio?** Alternative: cloud build (Codemagic) produces an installable APK/AAB from the repo — good on Windows.

---

## 11. Phase 7 — iOS

Requires macOS + Xcode → use a **cloud Mac CI** (Codemagic / GitHub Actions macOS / Ionic Appflow) since dev is on Windows.
1. On the Mac/CI: `cd client && npx cap add ios && npm run cap:sync`.
2. Apple Developer account; create the App ID (`com.coincompass.app`), certificates, provisioning.
3. Set `capacitor://localhost` in CORS (done in Phase 1).
4. APNs key for push (Phase 5).
5. Build → TestFlight → App Store review (privacy nutrition labels required).

---

## 12. Verification procedures

**Tier 1 — scaffold integrity (no tooling):**
```bash
cd client && npx cap doctor          # expect "Android looking great"
ls android/app/src/main/assets/public/index.html   # web app bundled
```
**Tier 2 — mobile UI without Android Studio:** `npm run dev` (repo root) → open URL →
Chrome DevTools device toolbar (Ctrl+Shift+M) → pick a phone. Same UI the shell renders.
**Tier 3 — real Android app:** `npm run android:open` → Run on emulator/device. For login,
either point at prod API (Phase 2) or emulator→host via `http://10.0.2.2:4000/api`.
**Auth (Phase 1):** the curl tests in §5a.

---

## 13. Command reference (run from `client/`)

```bash
npm run cap:sync        # build web + copy into native + update plugins
npm run cap:copy        # build web + copy only
npm run android:open    # open Android project in Android Studio
npm run android:run     # build & run on device/emulator
# live reload on a LAN device:
npm run dev -- --host   # note Network URL, e.g. http://192.168.1.20:5173
CAP_SERVER_URL=http://192.168.1.20:5173 npx cap run android
```

---

## 14. Open decisions / risks

- **Token lifetime / refresh:** current JWTs live 30–180 days (`sessionTtlDays`/`rememberTtlDays`). Acceptable for a native app in secure storage; revisit if a refresh-token flow is wanted.
- **Superadmin/wealth mode via token:** native must replace its token when mode changes (unlock/lock). Don't cache a stale mode.
- **Secure storage plugin choice:** `@aparajita/capacitor-secure-storage` (Keychain/Keystore) recommended over `@capacitor/preferences` (plaintext).
- **CSP:** currently disabled server-side ([index.ts](../server/src/index.ts) L28–29). Add a real CSP before wide release.
- **Bundle ID is permanent post-release** — lock it in before Phase 6.

---

## 15. Change log

- 2026-07-15 — Phase 0 scaffolded (Capacitor 8 + Android). Diagnosed native-auth blockers against live API. Plan authored.
```
