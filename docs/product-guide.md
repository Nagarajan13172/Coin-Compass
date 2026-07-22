# Product Guide

_Money Tracker (working title) — a complete personal‑finance & wealth companion, tuned for India (₹, gold, EMIs)._

---

## 1. What it is

Most money apps stop at "track your expenses." This one covers the **whole financial
picture**: day‑to‑day spending, savings goals, investments, physical assets, **loans with
real EMI/amortization math**, live **gold & silver** rates, and a rolled‑up **net worth** —
in one private, multi‑account workspace.

> **One‑line pitch:** See everything you own and owe, plan where it goes, and watch your net
> worth move — with automation (recurring, EMIs, reports) doing the busywork.

## 2. Who it's for

- **Individuals & families in India** who want more than an expense tracker — people juggling
  a salary, EMIs (home/car/personal), FDs/RDs, mutual funds/stocks, gold, and a few goals.
- Anyone who wants a **net‑worth view** without stitching together spreadsheets.
- Privacy‑minded users: it's **self‑hosted**, single‑tenant per account, optional **PIN lock**.

## 3. Feature modules

Grouped by what they help you do:

### 🧾 Track (the ledger)
- **Transactions** — income, expense, and **transfers** (from→to, never double‑counted);
  notes, **tags**, and per‑transaction currency.
- **Accounts** — unlimited Cash / Bank / Card / Wallet / Savings accounts, each with a live
  balance and a **detail page** (income/expense/transfer stats + full history).
- **Categories** — customizable income & expense buckets with icons/colors.
- **Calendar** — a month grid showing activity per day.
- **Import / Export** — bring in **CSV/XLSX**; export a date‑ranged **CSV** (currency‑tagged filename).

### 🎯 Plan
- **Budgets** — per‑category limits (weekly/monthly/yearly) with progress and **On track /
  Close / Over** status + remaining headroom.
- **Recurring** — templates for rent, salary, subscriptions, EMIs, etc. that **auto‑post** on
  schedule; surfaced as **"Due soon"** with a one‑tap, editable **Post**.
- **Goals** — savings targets (e.g. "New bike ₹80k") with **contribute/withdraw**, progress,
  and an **ETA** from your planned monthly saving.

### 📈 Grow (wealth)
- **Net Worth** — Assets (Savings: FD/RD/Emergency/Retirement; Investments: Stocks/MF/Real
  estate/Bonds/Gold) minus liabilities, with a **money‑map** overview and a **trend** over time.
- **Gold & Silver** — live daily rates (incl. GRT city retail rates), 22K/24K per gram, purity,
  price history, and a value calculator.

### 🏦 Borrow (loans, done properly)
- **Loans** — outstanding, ROI, EMI, tenure, provider, dates, status.
- **Amortization‑accurate** repayments: an EMI's **principal** reduces the balance while its
  **interest** is tracked as lifetime "interest paid."
- **Part payment** (with an optional **prepayment charge %**) and **Preclose/foreclose** (with
  charge), both recorded.
- **Payoff planner** — "what if I pay ₹X extra / a lump sum?" → months & interest saved, with
  an estimated close date.
- **Loan‑linked transactions/EMIs** so recording a payment updates the loan automatically.

### 🔎 Analyze
- **Reports** — income/expense/net, **insights** (avg daily spend, savings rate, biggest
  expense, month‑over‑month), category donut, income‑vs‑expense, trends, by‑account; period
  switcher and **CSV export**.
- **Email reports** — an automated summary emailed on the **1st and 15th** of each month.

### ⚙️ Foundation
- **Auth** — email/password with **email verification**, plus **Google/GitHub/Microsoft/Apple**
  OAuth; sessions via secure http‑only cookie.
- **Multi‑currency** — base currency + conversion rates.
- **Personalization** — theme (light/dark/system, remembered per account), locale, first day of
  week; optional **PIN lock**.

## 4. How it fits together

```
        TRACK ──────────────▶ ANALYZE
   (transactions,        (reports, insights,
    accounts,             email digests)
    categories) 
        │  ▲                     ▲
        │  │ auto‑post           │ rolls up
        ▼  │                     │
        PLAN ───────────────▶ GROW / BORROW
   (budgets, recurring,     (net worth = accounts
    goals)                   + holdings − loans;
                             loans update on payment)
```

Every rupee entered once flows everywhere: a transaction updates its **account balance**,
counts toward **budgets** and **reports**, can advance a **recurring** schedule, and — if it's
an EMI — pay down a **loan** and nudge **net worth**.

## 5. Architecture at a glance

- **Client:** React + Vite + TypeScript, Tailwind + shadcn/ui, TanStack Query, Recharts.
  PWA‑style single‑page app; mobile bottom‑nav + desktop sidebar.
- **Server:** Node + Express + TypeScript, MongoDB (Mongoose), Zod validation. `node-cron` for
  recurring posting, gold‑rate refresh, and email reports. Nodemailer (SMTP) for verification &
  report emails.
- **Auth:** JWT session cookie; `arctic` for OAuth; bcrypt (+ optional HMAC pepper) for passwords.
- **Data model:** User → Settings, Accounts, Categories, Transactions, Budgets, Recurring,
  Goals, Holdings, Loans (all user‑scoped). See [App Journey §6](./app-journey.md).

## 6. Design principles

- **One source of truth per rupee** — enter once, reflected everywhere.
- **Financially correct** — transfers don't double‑count; EMIs split principal/interest;
  prepayments are pure principal.
- **Automation over data entry** — recurring, rate refresh, and reports run themselves.
- **India‑first defaults** — ₹, day‑first dates, gold/EMI as first‑class citizens (currency is
  still configurable).
- **Private by default** — self‑hosted, per‑account, optional PIN.

## 7. Setup & configuration (for operators)

- Auth providers & SMTP: [`docs/auth-setup.md`](./auth-setup.md).
- Gold/silver rates are scraped from GRT daily (no key; disable with `METALS_ENABLED=false`); email
  reports need SMTP configured (falls back to logging the email to the server console in dev).
- Env template: `server/.env.example`.

## 8. Ideas on the roadmap

Weekly report cadence · PDF/CSV attachments on reports · savings‑goal auto‑contributions ·
push/in‑app reminders · Tamil/English localization · bill/photo attachments · opening
"interest paid to date" for pre‑existing loans.
