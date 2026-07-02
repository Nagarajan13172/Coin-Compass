# How to Run the Tests

Practical run guide. For what the suites cover and how they're built, see [README.md](./README.md).

All commands run from the **`tests/`** folder:

```bash
cd s:\Personal-Expense-Tracker\tests
```

---

## 1. First-time setup (once per machine)

```bash
npm install          # install the test dependencies
npm run e2e:install  # download the Chromium browser (only needed for the E2E layer)
```

> The very first API run also downloads a MongoDB binary automatically. If that
> download is blocked, point the tests at any reachable Mongo instead:
> `set TEST_MONGO_URI=mongodb://localhost:27017/coincompass_test` (PowerShell:
> `$env:TEST_MONGO_URI="..."`).

You do **not** need your dev servers (`npm run dev`) running — the tests start
their own throwaway server + database.

---

## 2. API layer — fast, deterministic (recommended for everyday use)

Hits the real backend over HTTP against a throwaway database. This is where the
exhaustive per-flow coverage lives.

| Command | What it does |
|---------|--------------|
| `npm test` | Run **all** feature suites |
| `npm run test:feature -- user-management` | Run **one** feature (filename filter) |
| `npm run test:watch` | Re-run automatically on file changes |
| `npm run test:ui` | Open the interactive Vitest UI |
| `npm run report:api` | Serve the last HTML report at <http://localhost:5210> |

**Viewing the report:** run `npm run report:api`, then open <http://localhost:5210>.

> ⚠️ Do **not** double-click `reports/api/index.html`. The report is a JavaScript
> app, and opening it from disk (`file://`) makes the browser block its scripts
> with a CORS error. It must be served over HTTP — that's what `report:api` does.

Example output:

```
✓ Signup > creates an account (201) ...
✓ 2FA — login challenge > a backup code logs in once and cannot be reused
...
Test Files  1 passed (1)
     Tests  32 passed (32)
```

---

## 3. E2E layer — real browser journeys

Drives the actual UI in Chromium against the real app. Playwright starts the
client and backend for you.

| Command | What it does |
|---------|--------------|
| `npm run e2e` | Run the browser journeys |
| `npm run e2e:report` | Open the last E2E HTML report |

**Report:** `tests/reports/e2e/` (opens in a browser).

---

## 4. Run a single feature

```bash
# API layer — filter by the spec's filename
npm run test:feature -- user-management

# E2E layer — filter by title text
npm run e2e -- -g "2FA"
```

---

## 5. Useful environment variables

| Variable | Effect |
|----------|--------|
| `TEST_MONGO_URI` | Use this MongoDB instead of the in-memory one. |
| `TEST_SERVER_PORT` | Port the test backend listens on (default `4599`). |
| `TEST_CLIENT_PORT` | Port the E2E client dev server uses (default `5290`). |
| `TEST_SERVER_LOG=1` | Echo the spawned server's logs — use when debugging a failure. |

PowerShell example:

```powershell
$env:TEST_SERVER_LOG="1"; npm run e2e
```

---

## 6. Troubleshooting

- **API tests hang on the first run** → the MongoDB binary is downloading. Wait,
  or set `TEST_MONGO_URI` to a running Mongo.
- **E2E "Invalid email or password" / redirected to /login** → a stray dev server
  was interfering. The E2E layer now uses its own ports (`4599` / `5290`) and never
  reuses an existing server, so make sure nothing else is bound to those ports.
- **See what the server did** → prefix the command with `TEST_SERVER_LOG=1`.
- **Port already in use** → change `TEST_SERVER_PORT` / `TEST_CLIENT_PORT`.

---

## Coverage today

**136 API tests across all 14 feature suites** (`src/api/*.spec.ts`) — all green —
plus a Playwright E2E journey for user-management:

user-management, accounts, categories, transactions, budgets, recurring, goals,
networth (holdings + wealth-lock), loans, credits, reports, metals, settings,
export/import.

Run one with `npm run test:feature -- <feature>` (e.g. `transactions`). New feature
suites get added the same way — copy an existing `src/api/*.spec.ts` as a template.
