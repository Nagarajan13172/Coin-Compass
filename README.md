# 💰 Money Tracker — Expense & Budget

A polished, full-stack personal-finance web app inspired by the **Money Tracker – Expense & Budget** Android app. Track accounts, income/expense/transfers, budgets, recurring transactions, and rich reports — with a clean, modern fintech UI in light & dark themes.

> Single-user, local-first (no login). Built with **React + Vite + TypeScript**, **Express + MongoDB**, **shadcn/ui**, **TanStack Query**, **Zustand**, **Motion** and **Recharts**.

---

## ✨ Features

- **Dashboard** — net-worth (animated count-up), income vs expense, cash-flow chart, spending donut, account balances, recent transactions, budget progress.
- **Transactions** — income / expense / transfer, grouped by day with running totals, search + filters (type, account, category), infinite scroll, and an **Add/Edit sheet with a built-in calculator keypad**.
- **Accounts** — cash, bank, card, wallet, savings. Live balances computed from transactions; transfers, colors, icons, archive, “include in total”.
- **Budgets** — per-category or overall, weekly/monthly/yearly, with progress bars and over-budget warnings.
- **Reports** — period navigation (week/month/year), donut by category (expense/income), income-vs-expense bars, trend area chart, CSV export.
- **Calendar** — month grid with per-day income/expense badges; tap a day to see its transactions.
- **Recurring** — standing orders (daily/weekly/monthly/yearly) auto-posted by an hourly job; pause/resume/run-now.
- **Categories** — manage income & expense categories with icon + color pickers.
- **Settings** — base currency (multi-currency aware, ₹ default), light/dark/system theme, first day of week, **PIN lock**, CSV export.

## 🧱 Tech stack

| Layer | Tech |
|------|------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, Motion, Recharts |
| State / data | TanStack Query (server state), Zustand (UI state) |
| Backend | Node, Express, Mongoose, Zod, node-cron |
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

### 3. Seed the database
```bash
npm run seed           # default categories, settings, a starter "Cash" account
# or, to include sample data to explore the UI:
npm --prefix server run seed -- --demo
```

### 4. Run the app (server + client together)
```bash
npm run dev
```
- Client: http://localhost:5173 (Vite proxies `/api` → server)
- API: http://localhost:4000/api
- DB inspector (optional): http://localhost:8081

> If port 5173 is busy, Vite picks the next free port — check the terminal output.

---

## 📁 Project structure

```
Expense-Tracker/
├── docker-compose.yml        # MongoDB + mongo-express
├── package.json              # root scripts (dev, seed, docker:up, build)
├── server/                   # Express + Mongoose API
│   └── src/
│       ├── models/           # Account, Category, Transaction, Budget, Recurring, Settings
│       ├── services/         # balance, reports (aggregations), recurring, csv
│       ├── controllers/ routes/ validators/ (zod) middleware/ seed/
│       └── index.ts          # app bootstrap + hourly recurring cron
└── client/                   # React + Vite SPA
    └── src/
        ├── components/ui/    # shadcn primitives
        ├── components/       # layout (AppShell, Sidebar, BottomNav…) + common widgets
        ├── features/         # transactions, accounts, budgets, reports, recurring, categories, settings
        ├── routes/           # one page per screen
        ├── hooks/            # TanStack Query hooks per resource
        ├── lib/              # api client, formatters, types, icons
        └── stores/           # Zustand UI store (theme, period, filters, sheet, pin)
```

## 🔌 API overview (`/api`)

`accounts`, `categories`, `transactions`, `budgets`, `recurring`, `settings` (CRUD) ·
`reports/{summary,by-category,trend,by-account}` · `dashboard` · `export/csv` ·
`settings/pin{,/verify}` · `recurring/run`.

Account balances and report figures are computed on the fly via MongoDB aggregation (`server/src/services/balanceService.ts`, `reportService.ts`), so they always stay consistent with the underlying transactions.

## 🎨 Design

Clean modern fintech: trust-blue primary, emerald income / rose expense, Inter with tabular figures for all amounts, lucide icons, Motion animations (page transitions, list stagger, count-up, spring sheets) that respect `prefers-reduced-motion`, and fully responsive layout (desktop sidebar ↔ mobile bottom nav + FAB).

## 🔐 A note on the PIN lock

Since the app has no authentication (single-user, local), the PIN is a **convenience lock on this device**, not real security. The PIN is stored only as a salted hash and never returned to the client.

## 🛠️ Useful scripts

```bash
npm run dev          # run server + client
npm run build        # type-check + build both
npm run seed         # seed defaults
npm run docker:up    # start MongoDB
npm run docker:down  # stop MongoDB
npm --prefix server run test   # balance/report/recurring unit tests
```
