# 💰 CoinCompass — Personal Finance Manager

A polished, full-stack **personal finance manager**. Track accounts and day-to-day spending, set budgets and savings goals, manage loans with real EMI/amortization math, follow investments, gold, and your rolled-up net worth — all in a clean, modern fintech UI with light & dark themes.

> Private and self-hostable, with account-based sign-in (email/password with verification, or social login) and an optional PIN lock. Built with **React + Vite + TypeScript**, **Express + MongoDB**, **shadcn/ui**, **TanStack Query**, **Zustand**, **Motion** and **Recharts**.

---

## ✨ Features

### Money in & out

- **Dashboard** — net-worth (animated count-up), income vs expense, cash-flow chart, spending donut, account balances, recent transactions, budget progress, and upcoming recurring bills.
- **Transactions** — income / expense / transfer, grouped by day with running totals, search + filters (type, account, category) with a filtered in/out/net summary, tags, infinite scroll, and an **Add/Edit sheet with a built-in calculator keypad**. Deletes go to a **Trash** you can restore from; entries are purged after a grace period.
- **Quick-add templates** — save partial transactions (payee, category, amount) and post them in one tap.
- **Accounts** — cash, bank, card, wallet, savings. Live balances computed from transactions; transfers, colors, icons, archive, “include in total”.
- **Budgets** — per-category or overall, weekly/monthly/yearly, with progress bars and over-budget warnings.
- **Recurring** — standing orders (daily/weekly/monthly/yearly) auto-posted by an hourly job; pause/resume, run-now, post-one, skip. Rules can fund a savings goal automatically.
- **Categories** — manage income & expense categories with icon + color pickers; frequently-used categories surface first in the picker.

### Wealth

- **Goals** — savings goals with target amounts/dates, progress, and contributions (manual or via a linked recurring rule).
- **Loans** — real **EMI / amortization** schedules, extra payments, and pre-closure math.
- **Credits** — informal IOUs with friends/family, optionally linked to a real transaction, with a net owed/owing summary.
- **Investments (holdings)** — track holdings and their value as part of net worth.
- **Net worth** — assets (accounts + holdings) minus liabilities (loans), with a daily-accumulated trend chart. Guarded behind an extra **wealth passcode** lock, separate from your login.
- **Gold & Silver** — live Chennai gold/silver rates in ₹ (24K/22K/18K per gram), scraped daily from GRT Jewellers ([grtjewels.com](https://www.grtjewels.com)) — no API key needed. A daily-refreshed dashboard widget and a dedicated page with a history chart; set `METALS_ENABLED=false` to hide it.

### Insight & review

- **Reports** — period navigation (week/month/year), donut by category (expense/income), income-vs-expense bars, trend area chart, per-account breakdown, and CSV export.
- **Insights** — automatic spending observations and month-over-month comparisons.
- **Calendar** — month grid with per-day income/expense badges; tap a day to see its transactions.
- **Scheduled email reports** — an optional daily summary emailed to you (requires SMTP).
- **Notifications** — in-app center for recurring auto-posts, budget/goal/loan reminders, and system events.
- **Import / Export** — CSV export of transactions, plus file import to bring existing data in.

### Accounts & security

- **Authentication** — email/password sign-up with **email verification**, password reset, and “stay signed in” sessions. Passwords are bcrypt-hashed with an optional application **pepper**.
- **Social login** — Google, GitHub, Microsoft/Entra, and Apple (each button appears only when that provider is configured).
- **Two-factor auth** — opt-in TOTP (authenticator app) with an emailed-OTP fallback and one-time backup codes.
- **PIN lock** — a quick on-device convenience lock on top of your session.
- **Localization** — English and Tamil (தமிழ்), including localized categories, enums, and dates.

- **Settings** — base currency (multi-currency aware, ₹ default), light/dark/system theme, first day of week, PIN lock, wealth passcode, scheduled-report opt-in, CSV export.

## 🧱 Tech stack

| Layer | Tech |
|------|------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, Motion, Recharts, i18next |
| State / data | TanStack Query (server state), Zustand (UI state) |
| Backend | Node, Express, Mongoose, Zod, node-cron |
| Auth | JWT sessions (httpOnly cookie), bcryptjs, otplib (TOTP), arctic (OAuth), nodemailer |
| Database | MongoDB (via Docker) |

---

## 🚀 Getting started

### Prerequisites
- Node.js 20+ and npm
- Docker (for MongoDB)

### 1. Start MongoDB
```bash
npm run docker:up      # starts MongoDB on :27017 (+ mongo-express on :8081)
```

### 2. Install dependencies
```bash
npm run install:all    # installs root, server, and client deps
```

### 3. Configure environment
```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```
The defaults work out of the box for local dev — MongoDB on `:27017`, the client proxying `/api` to the server on `:4000`. Everything below is **optional**:

- **Email** (SMTP) — leave blank and the server prints verification/reset links to the console instead of sending them, so signup still works locally.
- **Gold & Silver** — on by default (free daily GRT scrape, no key); set `METALS_ENABLED=false` to hide the widget/page.
- **Social login** — set a provider's client id/secret to show its button.

For production, set a strong `AUTH_JWT_SECRET` (and ideally `AUTH_PASSWORD_PEPPER`), plus your public `CLIENT_URL`/`APP_URL`. See [`docs/auth-setup.md`](docs/auth-setup.md) for step-by-step OAuth registration.

### 4. Seed the database
```bash
npm run seed           # creates a demo user + workspace (default categories, settings, a "Cash" account)
# or, to include ~60 sample transactions to explore the UI:
npm run seed -- --demo
# or seed for your own address:
npm run seed -- --email you@example.com --password s3cret --name "You" --demo
```
The default seed user is **`demo@coincompass.local` / `demo1234`** (email pre-verified, so no verification screen). Signing in with Google using the same address links to that account.

### 5. Run the app (server + client together)
```bash
npm run dev
```
- Client: http://localhost:5173 (Vite proxies `/api` → server)
- API: http://localhost:4000/api
- DB inspector (optional): http://localhost:8081

> `npm run dev` first runs `docker start local-mongo`, so it brings the database
> up automatically if it was stopped. Set `MONGO_CONTAINER` to use a different
> container name, or `SKIP_DB_START=1` if you run MongoDB some other way.

### Troubleshooting: login shows "Request failed with status code 500"

Almost always this means **MongoDB isn't running**, so the backend can't start and
`/api` calls are refused. Fix it with a single command:

```bash
docker start local-mongo    # start the local dev database
```

Then start the app with `npm run dev`. A healthy backend prints
`✓ MongoDB connected` and `✓ API listening on http://localhost:4000/api`.
Make the DB survive reboots so this can't recur:

```bash
docker update --restart unless-stopped local-mongo
```

> OAuth callbacks are exact-match. In local dev this repo defaults to
> `http://localhost:4000/api/auth/oauth/<provider>/callback`, so keep that same
> URI registered in the provider console unless you intentionally override it.

---

## 📁 Project structure

```
Expense-Tracker/
├── docker-compose.yml        # MongoDB + mongo-express
├── package.json              # root scripts (dev, seed, docker:up, build)
├── docs/                     # auth-setup, product-guide, user-guide, app-journey
├── server/                   # Express + Mongoose API
│   └── src/
│       ├── models/           # User, AuthIdentity, Account, Category, Transaction, Template,
│       │                     #   Budget, RecurringTransaction, Goal, Loan, Credit, Holding,
│       │                     #   NetWorthSnapshot, MetalPrice, Notification, Settings + auth tokens
│       ├── services/         # balance, reports, recurring, networth, loans, metals, mail, csv
│       ├── auth/ controllers/ routes/ validators/ (zod) middleware/ seed/ scripts/ i18n/
│       └── index.ts          # app bootstrap + cron jobs (recurring, notifications, metals, reports, trash)
└── client/                   # React + Vite SPA
    └── src/
        ├── components/ui/    # shadcn primitives
        ├── components/       # layout (AppShell, Sidebar, BottomNav…) + common widgets
        ├── features/         # auth, accounts, transactions, templates, budgets, recurring,
        │                     #   categories, goals, credits, metals, networth, notifications,
        │                     #   reports, settings
        ├── routes/           # one page per screen (Dashboard, Transactions, Loans, Goals, NetWorth…)
        ├── hooks/            # TanStack Query hooks per resource
        ├── i18n/             # i18next setup + en/ta locale catalogs
        ├── lib/              # api client, formatters, types, icons
        └── stores/           # Zustand UI store (theme, period, filters, sheet, pin)
```

## 🔌 API overview (`/api`)

All routes require a session cookie except the public auth endpoints. Most resources additionally require a **verified** email; holdings and the net-worth trend also require the **wealth** unlock.

| Group | Endpoints |
|------|-----------|
| **Auth** | `auth/{signup,signin,logout,me}` · `auth/{verify-email,resend-verification,forgot-password,reset-password,change-password}` · `auth/2fa/{status,setup,enable,disable,verify,email,pending,backup-codes,email-fallback}` · `auth/providers` · `auth/oauth/:provider{,/callback}` · `auth/{unlock,lock}-wealth` |
| **Core ledger** | `accounts` · `categories` · `transactions` (+ `summary`, `tags`, `balance`, `deleted`, `:id/restore`) · `templates` · `budgets` · `recurring` (+ `run`, `:id/{run,post-one,skip,transactions}`) |
| **Wealth** | `goals` (+ `:id/contribute`) · `loans` (+ `:id/{pay,preclose}`) · `credits` (+ `summary`) · `holdings` · `networth/history` · `metals/{latest,history,refresh}` |
| **Insight** | `reports/{summary,by-category,trend,by-account,insights,email-now}` · `dashboard` · `notifications` |
| **Data / prefs** | `settings` (+ `pin{,/verify}`, `wealth-passcode`) · `export/csv` · `import` |

Account balances and report figures are computed on the fly via MongoDB aggregation (`server/src/services/balanceService.ts`, `reportService.ts`), so they always stay consistent with the underlying transactions. Background work runs on `node-cron`: recurring auto-posts (hourly), a daily notification sweep, a daily gold/silver refresh, daily scheduled report emails, and a daily trash purge.

## 🎨 Design

Clean modern fintech: trust-blue primary, emerald income / rose expense, Inter with tabular figures for all amounts, lucide icons, Motion animations (page transitions, list stagger, count-up, spring sheets) that respect `prefers-reduced-motion`, and fully responsive layout (desktop sidebar ↔ mobile bottom nav + FAB).

## 🔐 A note on the locks

- **Sign-in** protects your account; enable **two-factor auth** for a second factor (authenticator app, with emailed-OTP fallback and backup codes).
- The **PIN** is an extra convenience lock on this device on top of your session — quick to enter, not a replacement for your password. It's stored only as a salted hash and never returned to the client.
- The **wealth passcode** gates the net-worth view (holdings + trend) behind a separate unlock, so someone who reaches an already-signed-in device still can't see your full financial picture.

## 🛠️ Useful scripts

```bash
# root
npm run dev          # docker start + run server + client
npm run build        # type-check + build both
npm run seed         # seed a demo user + workspace (pass -- --demo for sample data)
npm run docker:up    # start MongoDB
npm run docker:down  # stop MongoDB

# server (npm --prefix server run …)
npm --prefix server run test              # balance/report/recurring/i18n unit tests (vitest)
npm --prefix server run seed:all          # richer multi-entity seed
npm --prefix server run backfill:metals   # backfill gold/silver history from GoldAPI
```
