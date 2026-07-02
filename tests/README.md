# CoinCompass — Feature Test Suites

Automated, per-feature regression tests that live **separately from `client/` and
`server/`** (their own package, zero edits to the app). Run a feature's suite and
get a pass/fail report with expected-vs-actual for every flow — so as the app
grows you never have to re-check everything by hand.

## How it works

Everything is **black-box**: the harness boots a throwaway MongoDB and **spawns the
real server** against it, then tests hit it exactly like a client would (real HTTP,
real cookies, real middleware and rate limiters). One running stack serves both
layers.

| Layer | Tool | What it covers |
|-------|------|----------------|
| **API** | Vitest + axios (cookie jar) | every flow + edge/failure paths per feature |
| **E2E** | Playwright (Chromium) | the critical user journeys through the real UI |

2FA is fully covered with **no changes to the app**: TOTP secrets + backup codes
come back from the API and codes are generated with the same `otplib`; emailed 2FA
codes and the verify/reset links are captured from the server's mail output (with
SMTP unconfigured, the server logs each message — the harness parses it).

## Requirements

- Node 18+ (uses global `fetch`).
- First API run downloads a `mongod` binary via `mongodb-memory-server`. If that's
  blocked, set `TEST_MONGO_URI` to a reachable Mongo (e.g. a docker/local one) and
  it's used instead.
- E2E additionally needs a browser: `npm run e2e:install` (one-time).

## Install

```bash
cd tests
npm install
```

## Run — API layer

```bash
npm test                      # all API feature suites → HTML report at reports/api/
npm run test:feature -- user-management   # just one feature (filename filter)
npm run test:watch            # watch mode
npm run test:ui               # Vitest UI
```

Open the report: `npx vite preview --outDir reports/api` (or `npm run test:ui`).

## Run — E2E layer

```bash
npm run e2e:install           # one-time: download Chromium
npm run e2e                   # runs journeys → HTML report at reports/e2e/
npm run e2e:report            # open the last E2E report
```

Playwright boots the backend (global setup) and the client dev server (pointed at
the test API) automatically.

## Useful env vars

| Var | Effect |
|-----|--------|
| `TEST_MONGO_URI` | Use this Mongo instead of the in-memory one. |
| `TEST_SERVER_PORT` | Port the test server listens on (default `4599`). |
| `TEST_SERVER_LOG=1` | Echo the spawned server's stdout/stderr (debugging). |

## Layout

```
tests/
  src/
    harness/      shared black-box harness (mongo, server spawn, mail capture,
                  cookie-jar HTTP client, TOTP, user factories)
    api/          one *.spec.ts per feature (Vitest)
    e2e/          one *.e2e.ts per feature (Playwright) + support/
  reports/        generated HTML reports (git-ignored)
```

## Coverage today

- **user-management** — signup, email verification (+resend), signin, session/logout,
  change password, forgot/reset password, OAuth-provider status, and **2FA**:
  enrollment, TOTP login, backup codes (single-use), emailed fallback code, toggling
  fallback, regenerating backup codes, disable, and login rate-limiting.

## Adding a feature suite

Copy `src/api/user-management.spec.ts` as a template. Use the harness factories
(`createVerifiedUser`, `newSession`, …) to set up state, then drive the feature's
endpoints and assert responses + side-effects. Add an `*.e2e.ts` journey for the
one or two paths a user actually clicks through.
```
