# User Guide

_How to use Money Tracker (working title). See also the [App Journey](./app-journey.md) and
[Product Guide](./product-guide.md)._

> Tip: **＋ Add** (top bar, or the center button on mobile) works from anywhere to log a
> transaction. Numbers use your **base currency** (₹ by default); dates are day‑first.

---

## 1. Getting started

1. **Create an account** — go to **Sign up**, enter name/email/password, **or** click
   **Continue with Google**.
2. **Verify your email** (password sign‑ups only) — open the link we email you. Didn't get it?
   Use **Resend** on the verify screen. (Google logins skip this.)
3. You land on the **Dashboard** with a starter **Cash** account and default categories.
4. *(Optional)* **Settings → Security → enable PIN lock** to require a PIN each time you open the app.

**Sign in later:** email + password, or **Continue with Google**. Sessions last 30 days.

---

## 2. Everyday: transactions

**Add a transaction:** press **＋ Add** → pick **Expense / Income / Transfer**.

| Field | Notes |
|---|---|
| Amount | Use the keypad. |
| Account | Which account the money moves in/out of. |
| To account | **Transfers only** — the destination. |
| Category | Required for income/expense (not transfers). |
| Date | Defaults to today. |
| Note / Tags | Optional. Type a tag + **Enter** (e.g. `Hari`, `Bed`). |
| Apply to loan | *(expense/transfer)* mark it as a **loan repayment** — see §7. |

- **Edit / delete:** tap any transaction row (in Recent, Transactions, or Calendar).
- **Transfers** move money between your accounts and are **not** counted as income or expense.

**Find & filter (Transactions page):** search by note/payee/tag, and filter by **type,
account(s), category, and period** (All time / This month / Last 30 days / This year). The list
groups by day with a running per‑day total and infinite‑scrolls.

---

## 3. Accounts

- **Accounts page:** see every account with its live balance and type. **＋ New account** to add
  Cash / Bank / Card / Wallet / Savings (name, opening balance, currency, color, icon; toggle
  *Include in net worth*).
- **Account detail** (tap an account): current balance, **income / expense / transfers** stats,
  and that account's full transaction history. Edit, delete, or start a transfer from here.
- **Categories page:** add/rename/recolor income & expense categories.

---

## 4. Budgets

1. **Budgets → New budget** → choose a category, amount, and period (weekly/monthly/yearly).
2. Each budget shows a progress bar and a status: **On track** (green) · **Close** (amber, ≥80%)
   · **Over** (red), plus **₹ left** or **₹ over**.
3. The Dashboard surfaces your budgets too; tap one to manage it.

---

## 5. Recurring (rent, salary, EMIs, subscriptions)

1. **Recurring → New** → set type, amount, account/category, **frequency** (daily/weekly/
   monthly/yearly) and interval, start (and optional end) date. Preview shows the next runs.
2. Rules **auto‑post** when due. Anything due within 7 days appears on the Dashboard under
   **Due soon**.
3. **Post** a due item from the Dashboard → a dialog lets you **adjust the amount/date** before
   posting; the schedule advances to the next occurrence.
4. On the Recurring page you can **Run** (post all due), **Skip** the next occurrence, edit, or
   delete a rule.
5. **Loan EMI:** set **"Apply to loan"** on a recurring expense — each posting reduces that
   loan (see §7).

---

## 6. Goals

1. **Goals → New goal** → name, target amount, optional saved‑so‑far, monthly saving, target date.
2. **Add money** / **Withdraw** as you save; the card shows **% progress** and an **ETA**
   (e.g. "~5 months · Dec 2026") from your planned monthly saving.
3. Completed goals show a **Done** badge and group under **Completed**.

---

## 7. Loans

**Add a loan:** **Loans → Add loan** → name, provider, type, **outstanding**, original amount,
**ROI %**, **EMI**, prepayment/foreclosure charge %, dates, status.

Each loan card shows outstanding, EMI, interest rate, **tenure left (+ est. close date)**, and
**Interest paid so far**.

- **Record an EMI** two ways — both are amortization‑accurate (only the **principal** portion
  reduces the balance; the **interest** portion is tracked):
  - a **transaction** with **Apply to loan** set, or
  - a **recurring EMI** linked to the loan (auto‑posts + reduces it).
- **Part payment** (⋯ menu): a lump‑sum prepayment — the **full amount** comes off principal;
  enter a **prepayment charge %** to record the fee.
- **Preclose** (⋯ menu): foreclose the loan now; enter the **charge %** to see total payable.
- **Payoff planner** (Calculator): try **extra per month** and/or a **one‑time lump sum** →
  see how many **months** and how much **interest** you'd save, and the new close date.
- The **Overview** tab shows outstanding‑by‑loan and payoff progress across all loans.

---

## 8. Net Worth & Gold

**Net Worth page**
- **Overview:** Net worth = **accounts + holdings − active loans**, a money‑map donut
  (Expenditure / Saving / Investment) with drill‑downs, and a net‑worth **trend**.
- **Assets:** add holdings under **Saving** (Fixed/Recurring Deposit, Emergency, Retirement) or
  **Investment** (Stocks, Mutual Funds, Real Estate, Bonds, Gold). Jewellery → Gold; house →
  Real Estate.

**Gold page**
- Live **gold & silver** rates (choose your city for GRT retail rates), 22K/24K per gram, daily
  change, price history, and a **value calculator** (grams → ₹).

---

## 9. Reports & insights

- Pick **Week / Month / Year** and step through periods.
- See **Income / Expense / Net**, and insight cards: **Avg daily spend**, **Savings rate**,
  **Biggest expense**, and **spending vs last period**. A plain‑English line summarizes the month.
- Charts: **spending by category** (tap a slice → its transactions), **income vs expense**,
  **trend**, and **by account**.
- **Export CSV** for the selected range (filename includes the date & currency).

**Emailed reports:** a summary is emailed automatically on the **1st and 15th** of each month.
Toggle it in **Settings → Email reports**, and use **"Send a test report now"** to preview.

---

## 10. Calendar

**Calendar page** lays out the month as a grid; each day shows its activity. Tap a day to see
its transactions (and filter by account within the day).

---

## 11. Settings & data

- **Profile:** wallet name/description.
- **Preferences:** base **currency** & rates, **theme** (light/dark/system — remembered per
  account), locale, first day of week.
- **Email reports:** on/off + send a test.
- **Security:** enable/disable **PIN lock**.
- **Data:** **Import** transactions from **CSV/XLSX** (it reports imported/failed rows and any
  categories/accounts it created), and **Export** a date‑ranged **CSV**.

---

## 12. Tips & FAQ

- **Log fast:** the top‑bar **＋** (or mobile center button) opens the entry sheet from anywhere;
  it pre‑fills from your current filters.
- **Transfers not showing as spend?** Correct — transfers move money between your accounts and
  aren't income/expense.
- **My loan dropped by less than my EMI.** Expected — only the **principal** part of an EMI
  reduces the balance; the rest is interest (shown as "interest paid").
- **Savings rate shows a huge negative.** That just means expenses far exceeded a small income
  that period; it's capped at "< −100%".
- **Didn't get the verification/report email?** Check spam; ensure SMTP is configured
  ([`docs/auth-setup.md`](./auth-setup.md)). In dev, emails are logged to the server console.
- **OAuth button missing?** That provider isn't configured yet — see the auth setup doc.
- **Forgot PIN?** The PIN only locks the UI on this device; signing out and back in restores access.
