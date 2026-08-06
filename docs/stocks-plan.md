# Stocks & Demat — implementation plan

Bringing equity holdings into CoinCompass: a Demat account, live NSE/BSE prices,
and a portfolio that feeds the Net Worth page.

**Decisions locked:** buys/sells are fully ledger-linked (Phase 2), and positions
are tracked **per lot** (each buy is its own record) so LTCG dates and FIFO
realized P&L are both answerable.

---

## 1. Price source

`https://query1.finance.yahoo.com/v8/finance/chart/<SYMBOL>` — **no API key, no
crumb, no cookie.** Verified live against `RELIANCE.NS` (₹1322.30, INR, NSE, IST),
`RELIANCE.BO`, and `^NSEI`.

Returns per call: `regularMarketPrice`, `chartPreviousClose`, `fiftyTwoWeekHigh/Low`,
`regularMarketDayHigh/Low`, `regularMarketVolume`, `longName`, `currency`, `timezone`.
Daily history via `?interval=1d&range=6mo` (125 points confirmed).

Symbol lookup: `/v1/finance/search?q=infosys&quotesCount=6&newsCount=0` → returns
`INFY.NS` with `exchange`, `sector`, `industry`.

### Constraints discovered by testing

| Finding | Consequence for the design |
|---|---|
| `/v7/finance/quote?symbols=A,B` → **401 Unauthorized** | No batching. One HTTP call per symbol ⇒ prices **must** be a global cache, refreshed only for symbols someone holds. |
| `500325.BO` (numeric scrip code) resolved to a stale 2019 mutual-fund record | Never accept a hand-typed ticker. Resolve through `/v1/finance/search` and store the returned symbol. |
| `INFY` (NYSE) returns **USD** | Validate `currency === "INR"` at add-time. Mixed-currency net worth without an FX rate is confidently wrong. |
| Invalid symbol → `404 {"error":{"code":"Not Found"}}` | Clean error shape to branch on. |

The endpoint is unofficial and carries no SLA. Mitigations: a `StockPriceProvider`
interface so the provider is one swappable file, a `STOCKS_ENABLED` flag mirroring
`env.metals.enabled`, and fallback to last-known close on any fetch failure — a
Yahoo outage degrades to stale prices, never to a broken Net Worth page.

---

## 2. Data model

### `Instrument` — global registry (no `user` field)

Mirrors the `Person` registry pattern. Caches what the search endpoint told us so
we never re-resolve a symbol.

```
symbol (unique, e.g. "RELIANCE.NS"), exchange ("NSE"|"BSE"), shortName, longName,
sector, industry, currency ("INR"), lastSeenAt
```

### `StockPrice` — global daily snapshot (no `user` field)

Direct analogue of [`MetalPrice`](../server/src/models/MetalPrice.ts). Two users
holding RELIANCE share one row.

```
symbol, date (YYYY-MM-DD IST), close, prevClose, change, changePct,
dayHigh, dayLow, week52High, week52Low, volume, source, fetchedAt, stale
```

Unique index `{ symbol: 1, date: -1 }` — same shape as `metalPriceSchema.index`.

### `StockLot` — one buy, per-user

```
user, instrument (ref), demat (ref Account), qty, qtyRemaining,
buyPrice, buyDate, fees (brokerage + STT + GST), note,
status: "open" | "closed",
buyTransaction (ref Transaction, set in Phase 2)
```

`qtyRemaining` is what FIFO decrements; `qty` stays as entered so the lot's own
history is never rewritten.

### `StockSale` — one sell, per-user

```
user, instrument, demat, qty, sellPrice, sellDate, fees,
allocations: [{ lot, qty, costBasis, buyDate, gainType: "STCG"|"LTCG" }],
realizedPL, sellTransaction (ref Transaction, Phase 2)
```

Allocations are recorded explicitly rather than recomputed, so an edit or delete
can reverse exactly what was applied — the same discipline as `loanPrincipal` /
`goalContribution` on [`Transaction`](../server/src/models/Transaction.ts).

### Changes to existing models

- `ACCOUNT_TYPES` gains `"demat"` (additive; needs `enums.json` keys in **en and ta**).
- `Account.system` gains the value `"securities"` for the hidden cost-basis bucket.
- `NetWorthSnapshot` gains `stocksTotal` for transparency.

---

## 3. Net-worth integration

Three buckets, each with exactly one job:

| Bucket | What it holds | In `accountsTotal`? |
|---|---|---|
| Demat account (`type: "demat"`) | idle cash at the broker | yes |
| Securities account (`system: "securities"`) | total cost basis | **no** — `includeInTotal: false` |
| Open lots | market value | no — enters via `investment` |

```
stocksMarketValue = Σ over open lots (qtyRemaining × latest close)
investment       += stocksMarketValue      // "Stocks" slice appears in the donut free
holdingsTotal     = saving + investment    // formula unchanged
assets            = accountsTotal + holdingsTotal   // formula unchanged
```

**The double-count trap this avoids.** If the demat account held cash *and* the
position counted at market value, ₹50k of funding plus a ₹50k position would read
as ₹100k of net worth. Routing the buy through an excluded Securities account is
the same trick Credits already uses with `system: "money_lent"` — cash leaves the
demat account, the cost basis parks somewhere invisible to `accountsTotal`, and
the lot supplies market value. Net worth then moves by exactly the unrealized gain.

Because the `assets` and `holdingsTotal` formulas are untouched, the existing
net-worth trend, snapshots and donuts pick stocks up with no changes.

⚠️ The server and client compute net worth **independently** —
[`networthService.ts:42-49`](../server/src/services/networthService.ts) and
[`NetWorthPage.tsx:94-104`](../client/src/routes/NetWorthPage.tsx). Both must gain
the stocks term in the same commit, and a test must assert they agree.

---

## 4. Ledger mechanics (Phase 2)

**Fund the account** — ordinary transfer, Bank → Demat. Net worth unchanged. Works
today with zero new code.

**Buy** — transfer Demat → Securities for `qty × buyPrice + fees`.
Net worth change at the moment of purchase = **−fees**, which is correct: the fees
are genuinely gone, the shares are worth what you paid.

**Sell** — two effects on one transaction, mirroring how a loan payment splits
principal from interest:

- `stockCostBasis` — transfer Securities → Demat, returning capital
- `stockRealized` — income to Demat (or expense, if a loss), category `Capital Gains`

Realized gains therefore show up in Reports as real income, which is the whole
point of linking the ledger.

**Reversal.** Editing or deleting a sale walks its stored `allocations` backwards
to restore each lot's `qtyRemaining`. Never recompute FIFO to undo — recomputation
drifts if any intervening lot changed.

---

## 5. Refresh strategy

Cron in [`server/src/index.ts`](../server/src/index.ts), `timezone: "Asia/Kolkata"`,
alongside the existing metals jobs:

- Every 15 min between **09:15 and 15:30 IST, Mon–Fri** (NSE hours)
- One close-of-day capture at **15:45 IST** — the authoritative daily row
- On boot, to backfill a missed day

Only symbols with at least one open lot are fetched (`distinct` over `StockLot`),
so the fan-out is bounded by what the app's users actually own, not by NSE's
listing count. Add a concurrency cap of ~4 and an on-demand cooldown mirroring
`ON_DEMAND_COOLDOWN_MS` in
[`metalPriceService`](../server/src/services/metalPriceService.ts).

Market holidays need no special handling: no new data simply means the previous
close stands, flagged `stale`.

---

## 6. Surfaces

- **`/stocks`** — new page in the `groups.wealth` nav group, behind
  `requireWealthAccess` (it reveals net worth). Holdings table: symbol, qty, avg
  cost, LTP, day change, unrealized P&L, allocation %. Per-lot expansion showing
  buy date and **days-to-LTCG**.
- **Net Worth → Assets tab** — a "Stocks" section beside Cash Accounts and
  Holdings, and a "Stocks" slice in the investment donut (`SUBTYPE_META.stocks`
  already exists, so the icon and colour are already defined).
- **Add-position dialog** — search-as-you-type against `/v1/finance/search`,
  never a free-text ticker field.
- **Deletes** — the shared type-to-confirm `ConfirmDeleteDialog`, like every other
  delete in the app.
- **i18n** — a new `stocks.json` namespace in **both** `en` and `ta`. The existing
  i18n suite checks catalogue parity; a missing Tamil file fails it.

---

## 7. Beyond the basics

- **Days-to-LTCG badge.** Per-lot date arithmetic on data already stored. The most
  useful thing a portfolio view can tell an Indian retail investor, and it's the
  reason per-lot tracking was chosen. Surface it through the existing notification
  sweep too ("3 lots become LTCG-eligible this month").
- **Benchmark vs NIFTY 50.** `^NSEI` confirmed working; history is already being
  fetched. "Your portfolio +8.2% vs NIFTY +5.1%."
- **Concentration insight.** `Instrument.sector` feeds a sector donut through the
  existing `CategoryDonut`, and [`insightsService`](../server/src/services/insightsService.ts)
  flags single-stock concentration.
- **Portfolio history.** Let `NetWorthSnapshot.stocksTotal` accumulate daily, the
  same self-maintaining approach as `getNetWorthHistory`. Do **not** attempt to
  reconstruct history backwards — qty-at-date makes that a much harder problem
  than it appears.
- **Dividends** (Phase 3). Income transactions to the demat account under a
  `Dividend` category. Fits the ledger exactly and makes yield computable.
- **Stale-price honesty.** Stamp "as of 15:30 IST", grey out stale rows, never
  render a Friday close as if it were live. Same discipline the metals code
  applies to interpolated data.

**Out of scope for v1:** US/foreign equities, mutual funds (NAV is a different
feed), F&O, and intraday charts.

---

## 8. Invariants to test

Spec tests, not characterization:

1. Funding the demat account never changes net worth.
2. A buy changes net worth by exactly `−fees`.
3. Cash + cost basis + unrealized gain equals net worth computed the other way.
4. Server and client net-worth computations agree to the rupee.
5. FIFO allocation: selling 15 of `[lot A: 10, lot B: 10]` consumes all of A and 5 of B.
6. Realized P&L = proceeds − allocated cost basis − fees, for partial and full sells.
7. Deleting a sale restores each lot's `qtyRemaining` exactly.
8. The 12-month anniversary itself is **STCG**; the day after is the first LTCG
   day. (An earlier draft of this plan had that backwards. Under s.2(42A) listed
   equity is short-term when held for *not more than* 12 months, so the boundary
   is strictly after the anniversary — see `longTermFrom`.)
9. A failed price fetch yields the last known close and a `stale` flag — never `NaN`.
10. Two users holding the same symbol trigger **one** upstream fetch.
11. A non-INR symbol is rejected at add-time.
12. `/stocks` and the stocks term in `/networth` both 403 when the wealth lock is on.

---

## 9. Build order

| Phase | Scope | Status |
|---|---|---|
| **1** | `Instrument` + `StockPrice` + provider + cron; `demat` account type; `StockLot`; `/stocks` page; net-worth term; en + ta catalogues. | **Done** |
| **2** | `Securities` system account; buy/sell create transactions; `StockSale` + FIFO realized P&L; reversal logic. | **Done** |
| **3** | LTCG notifications, NIFTY benchmark, sector donut, dividends, `stocksTotal` history. | Not started |

Phases 1 and 2 shipped together on `feat/stocks-demat`, since the ledger link was
the decision that shaped the data model — building Phase 1 standalone first would
have meant a migration to undo it.

Phase 3 items are all additive: none of them changes the schema or the net-worth
maths, so they can land whenever. The days-to-LTCG figure they build on is already
computed and surfaced per lot.
