---
name: verify
description: Launch and drive the CoinCompass app (React client + Express API + Mongo) to observe a change end-to-end in a real browser.
---

# Verify CoinCompass changes end-to-end

Runtime observation recipe for this repo. Use it to drive a UI/API change in the
real app (not tests). Client = Vite React on **:5173**, API = Express on **:4000**,
MongoDB on **:27017** (Docker; `npm run dev` starts the container automatically).

## 1. Launch the stack
```bash
npm run dev            # ensures Mongo container, starts server:4000 + client:5173
# wait until both answer:
curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/api/health   # -> 200
curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/             # -> 200
```
Run it backgrounded and poll the two health checks before driving.

## 2. Seed a ready-to-use account
```bash
npm --prefix server run seed -- --demo   # demo@coincompass.local / demo1234, emailVerified, ~64 txns
```
The demo user is pre-verified (skips the email-verification wall). Idempotent —
reuses an existing user/workspace. NOTE: pass `--demo` to the **server** script
(`npm --prefix server run seed -- --demo`); `npm run seed -- --demo` at the root
swallows the flag.

## 3. Drive a browser (Playwright already installed under tests/)
`tests/node_modules` has `playwright` + chromium. Put the script under `tests/`
so the bare `import { chromium } from "playwright"` resolves, run with `node
tests/<script>.mjs`, screenshot to a scratch dir, delete the script after.

Reliable selectors:
- Login: `#email`, `#password`, `button[type="submit"]` (redirects off `/login`).
- Transaction rows (`/transactions`): `main button[class*="py-2.5"]` — click to open the edit sheet.
- Any open sheet/dialog: `[role="dialog"]`; its title is an `<h2>`.
- Amount keypad display: `[role="dialog"] [class*="text-2xl"]` (the big current amount).
- New-transaction: desktop "Add" is `header button` with text `Add` → dropdown `menuitem` "Expense".

Default UI language is English, so role-name text matches (`Save changes`, `Cancel`, `Expense`).

## Gotchas
- `server/.env` must exist (it does) for both server and seed to reach Mongo.
- A stale run holding :4000/:5173 makes the client 500 on `/api`; `npm run dev`
  reclaims the ports on start.
