# App Journey & User Flow

_Money Tracker (working title) — a personal finance & wealth app._

This document traces **how the app starts and how a user moves through it**, from first
launch to daily use. For "what each screen does" see the [User Guide](./user-guide.md);
for the product's shape and modules see the [Product Guide](./product-guide.md).

---

## 1. First‑launch / onboarding flow

```
                     ┌─────────────┐
   open the app  ──▶ │  Not signed │
                     │     in?     │
                     └──────┬──────┘
                            │
             ┌──────────────┴───────────────┐
             ▼                              ▼
      ┌────────────┐                 ┌────────────┐
      │  /signup   │                 │   /login   │
      │  name +    │                 │  email +   │
      │  email +   │                 │  password  │
      │  password  │                 │   — or —   │
      │  — or —    │                 │ "Continue  │
      │ Continue   │                 │ with       │
      │ with Google│                 │  Google"   │
      └─────┬──────┘                 └─────┬──────┘
            │ (password signup)            │
            ▼                              │
   ┌──────────────────┐                    │
   │  /verify-email    │  ← verification    │
   │  "check your inbox"│    link emailed    │
   │  click the link → │                    │
   └─────────┬─────────┘                    │
             │  (Google logins are          │
             │   already verified)          │
             └──────────────┬───────────────┘
                            ▼
                   ┌─────────────────┐
                   │  PIN lock set?  │ (optional, per account)
                   └────────┬────────┘
                       yes  │  no
                    ┌───────┴────────┐
                    ▼                ▼
              enter PIN         ┌──────────┐
                    └──────────▶│ Dashboard│  ◀── the home base
                                └──────────┘
```

**What happens under the hood on first sign‑up:** the account is provisioned with a
starter workspace — a **Settings** doc (base currency ₹ INR, theme, locale), the
**default income & expense categories**, and a starter **"Cash" account** — so the
dashboard is usable immediately.

**Gate:** email/password accounts must **verify their email** before the app unlocks
(server‑enforced). Google/GitHub/Microsoft/Apple logins arrive pre‑verified and skip it.

---

## 2. Returning‑user flow

```
open app ─▶ session valid? ─┬─ yes ─▶ (PIN? enter) ─▶ Dashboard
                            └─ no  ─▶ /login ─▶ Dashboard
```

The session is a secure http‑only cookie (30 days). If it expires mid‑use, any action
bounces the user to `/login` and back.

---

## 3. The home base — Dashboard

The Dashboard is where every session lands and the hub the rest of the app radiates from.
Top to bottom it answers "where do I stand, and what needs attention?":

| Block | Answers | Deep‑links to |
|---|---|---|
| **Net worth** (hero) | What am I worth? (hover = per‑account breakdown) | `/net-worth` |
| **Income / Expense** | This period's flow | — |
| **Cash flow** chart | Trend + "Net this period" | — |
| **Accounts** | Balances per account + type | `/accounts/:id` |
| **Gold & Silver** | Today's rates | `/gold` |
| **Spending by category** | Where money went (donut) | `/reports`, tap slice → filtered `/transactions` |
| **Recent** | Latest transactions | `/transactions` |
| **Due soon** | Upcoming recurring / EMIs (with **Post**) | `/recurring` |
| **Budgets** | On track / Close / Over + headroom | `/budgets` |
| **Goals** | Savings progress / Done | `/goals` |

A period switcher (**Week / Month / Year**) re‑scopes the flow blocks.

---

## 4. Navigation model

- **Desktop:** left **sidebar** with all sections; active page highlighted.
- **Mobile:** **bottom nav** with the primary trio — **Dashboard · Transactions · Reports** —
  a center **＋** (add transaction), and **More** for everything else.
- **Top bar (everywhere):** quick **＋ Add**, global **search**, **theme** toggle, **account menu**.

Full section map:

```
Dashboard ─ overview & jump‑off point
Transactions ─ the ledger (add/edit/filter/search)
Accounts ─▶ Account detail (balance, stats, history)
Categories ─ organise income/expense buckets
Budgets ─ limits per category
Recurring ─ rules that auto‑post (rent, EMI, salary…)
Calendar ─ transactions laid out by day
Goals ─ savings targets with ETA
Net Worth ─ assets (savings + investments) + trend
Loans ─ liabilities, EMIs, payoff planner
Gold ─ live gold/silver rates + calculator
Reports ─ analysis, insights, export
Settings ─ currency, theme, PIN, email reports, import/export
```

---

## 5. The daily / monthly loop

```
        ┌──────────────── DAILY ────────────────┐
        │  spend → add a transaction (＋)        │
        │  (income, expense, or transfer;        │
        │   tag it; link an EMI to a loan)       │
        └───────────────────┬────────────────────┘
                            ▼
        ┌──────────────── ONGOING ───────────────┐
        │  "Due soon" → Post rent/EMI/salary      │
        │  Budgets show On track / Over           │
        │  Goals → Add money as you save          │
        └───────────────────┬────────────────────┘
                            ▼
        ┌──────────────── MONTHLY ───────────────┐
        │  1st & 15th → summary report emailed    │
        │  Reports → review month, spot trends    │
        │  Net Worth / Loans → track wealth & debt│
        └─────────────────────────────────────────┘
```

**Automation that runs without the user:**
- **Recurring** rules auto‑post when due (hourly), and a linked **EMI** reduces its loan's
  principal (interest tracked separately).
- **Gold/silver** rates refresh daily.
- **Email reports** go out on the **1st and 15th** at 08:00 IST (opt‑out in Settings).

---

## 6. How the data connects (mental model)

```
        Account ──< Transaction >── Category
           │            │  \
           │            │   └── (optional) Loan   → EMI reduces principal
           │            │                          → interest is tracked
           │            └── (optional) Recurring   → the rule that posted it
           │
   Net worth = Σ included Account balances
             + Σ Holdings (savings + investments)
             − Σ active Loan outstanding
```

- A **transaction** always has an **account** and (unless a transfer) a **category**;
  it may also be tagged, tied to a **recurring** rule, and/or applied to a **loan**.
- **Transfers** move money between two accounts and are **not** counted as income/expense.
- **Net worth** is a live rollup of accounts + holdings − loans, snapshotted over time.

---

_Next: the [Product Guide](./product-guide.md) (what it is & why) and the
[User Guide](./user-guide.md) (how to do things)._
