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

**136 API tests across 14 feature suites** (one `*.spec.ts` per feature under `src/api/`),
plus a Playwright E2E journey for user-management.

| Feature | Highlights covered |
|---------|--------------------|
| user-management | signup, email verify (+resend), signin, session/logout, change/forgot/reset password, OAuth status, **2FA** (enroll, TOTP, single-use backup codes, emailed fallback, toggle, regenerate, disable), login rate-limiting |
| accounts | CRUD, defaults, computed balance, archive visibility, force-delete, ownership |
| categories | CRUD, default seeding, type filter, in-use delete guard, ownership |
| transactions | CRUD, pagination, filter & search, **balance side-effects** (expense/income/transfer/edit/delete), validation, ownership |
| budgets | CRUD, **over-spend detection**, validation, ownership |
| recurring | CRUD, run / run-all / post-one / skip, history, balance effect, ownership |
| goals | CRUD, contribute (+/−), completion, over-withdraw clamp, ownership |
| networth | holdings CRUD, subtype/class validation, trend history, **wealth-lock gating** (lock/unlock/wrong-passcode) |
| loans | CRUD, part-payment auto-close, preclosure + charge, validation, ownership |
| credits | CRUD, **reflection into balances** (+ un-reflect), per-person summary net, validation, ownership |
| reports | summary totals, category/trend/account breakdowns, on-demand email |
| metals | disabled-without-key path (latest/history/refresh), auth |
| settings | read (no secret hashes), update, **PIN lock** (set/verify/disable), **wealth passcode** |
| export/import | CSV export, import (+auto-create accounts), invalid-row reporting, **round-trip** |

## Adding a feature suite

Copy `src/api/user-management.spec.ts` as a template. Use the harness factories
(`createVerifiedUser`, `newSession`, …) to set up state, then drive the feature's
endpoints and assert responses + side-effects. Add an `*.e2e.ts` journey for the
one or two paths a user actually clicks through.
```
