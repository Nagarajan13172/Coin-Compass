# CoinCompass — Bug / Gap Audit

A code-level audit of all 14 features, cross-checked with an automated repro suite
(`tests/src/api/edge-cases.spec.ts`). Each **confirmed** item has a test that fails
against the current app (marked `it.fails` so the suite stays green while documenting
the defect — when you fix a bug, its test flips red as a reminder to remove the
marker). "Documented" items are real but need a product decision or a heavier harness
(CSV upload / FX / concurrency) and are kept as visible `it.skip`s.

**16 confirmed defects (9 fixed ✅ · 7 still open ⬜) · 10 documented gaps · 6 invariant guards.**

Legend: 🔴 bug (wrong result / data corruption) · 🟠 gap (missing safeguard) · 🔵 improvement.
✅ = fixed & guarded by a passing test · ⬜ = confirmed, still open (`it.fails` repro in place).

---

## Confirmed — reproduced by a test

| ID | Status | Sev | Where | The defect (and what *should* happen) |
|----|--------|-----|-------|----------------------------------------|
| **B1** | ✅ | 🔴 high | `controllers/transactionController.ts` | The same-account / no-destination transfer guards existed **only on create**. You could `PATCH` a normal expense into a transfer with `toAccount == account` (or no `toAccount`) — money left as `transferOut` with no matching `transferIn`. **Fixed:** `updateTransaction` now validates the effective transfer after the merge. |
| **B2** | ✅ | 🔴 high | `controllers/accountController.ts` | Force-deleting an account ran `Transaction.deleteMany`, **bypassing** loan-reversal + credit-cascade → loans kept a wrongly-reduced `outstanding`, credits dangled. **Fixed:** force-delete now reverses each txn's loan payment and cascades its credit before removal. |
| **B3** | ⬜ | 🔴 high | `services/balanceService.ts:66` + `schemas.ts:95` | A transaction's `currency` is independent of its account's, and balances `$sum` raw across currencies. A `USD 100` expense on an INR account subtracts `100` INR. *Reject (or convert) a mismatched currency.* |
| **B4** | ✅ | 🔴 high | `controllers/reportController.ts`, `exportController.ts` | Reports/export used `date < midnight-of-"to"`, **dropping every transaction on the last day** of the range. **Fixed:** `to` is now inclusive (end = start of next day). |
| **B11** | ⬜ | 🔴 high | `services/recurringService.ts:106` | A recurring EMI **keeps posting after the loan is fully paid** — the rule is only deactivated by `endDate`, never by loan closure. *Stop the rule when its loan closes.* |
| **B12** | ⬜ | 🔴 med | `utils/dateRange.ts:35` `addMonths` | `setMonth` overflow makes a monthly rule on the 31st **skip February** (Jan 31 → Mar 3) and shift the day forever. *Clamp to the last valid day of the target month.* |
| **B13** | ⬜ | 🟠 med | `services/recurringService.ts:78` | The **final EMI over-debits**: full fixed amount posted though only the payoff applies to the loan; excess isn't stored, so a reverse/delete can't restore it. *Post the payoff for the last instalment.* |
| **B14** | ⬜ | 🔴 med | `recurringController.ts:42` / `transactionController.ts:85` | The `loan` link is never ownership-checked, and `listRecurring` populates `loan.name` — linking to **another user's loan discloses its name** (IDOR). *Validate loan ownership.* |
| **B16** | ✅ | 🟠 med | `controllers/loanController.ts` | `deleteLoan` didn't cascade: past transactions kept a **dangling `loan` id** and linked recurring rules stayed active. **Fixed:** delete now unlinks transactions and detaches recurring rules. |
| **B17** | ✅ | 🟠 med | `validators/schemas.ts` `loanSchema` | A **non-amortizing loan** (`emi ≤ monthly interest`) and `startDate > endDate` were accepted. **Fixed:** two refines reject both. |
| **B18** | ✅ | 🔴 med | `validators/schemas.ts` `recurringSchema` | Recurring transfers had **no transfer refine** → same-account / destination-less recurring transfers vanished money each run. **Fixed:** mirrors the one-off transfer refines. |
| **B19** | ✅ | 🔴 high | `controllers/categoryController.ts` | Deleting a budget's category made `categoryIdOf(null)` drop the filter → the budget **silently counted every expense**. **Fixed:** deleting a category now removes its scoped budgets. |
| **B22** | ⬜ | 🟠 med | `controllers/budgetController.ts:56` + `schemas.ts:121` | `budget.category` is only shape-validated; a budget can reference **another user's category**, which `listBudgets` populates (info leak). *Verify category ownership.* |
| **B23** | ✅ | 🔴 low | `controllers/goalController.ts` | `updateGoal` used a raw `findOneAndUpdate` and **never recomputed `achievedAt`**. **Fixed:** it now recomputes achievement like `contributeGoal`. |
| **B24** | ✅ | 🟠 low | `services/creditService.ts` | `updateCredit` merged `account` with `patch.account ?? old`, so `account: null` couldn't **clear** the account. **Fixed:** distinguishes "absent" from "explicit null". |

> Still-open confirmed bugs (B3, B11, B12, B13, B14, B22) keep an `it.fails` repro in the suite — the suite stays green and each flips red the moment it's fixed.

---

## Documented — verified, but need a decision / heavier harness

| ID | Sev | Where | The gap |
|----|-----|-------|---------|
| **B5** | 🔴 high | `balanceService.ts:85`, `networthService.ts:42` | **Net worth sums balances across currencies as one unit** (`rateToBase` is stored but never applied). ₹100k + $1k reads as 101,000. Needs an FX policy. |
| **B6** | 🟠 high | `services/importService.ts:209,284` | **Import isn't atomic**: accounts/categories are created eagerly in the row loop; a mid-file error (or `insertMany ordered:true`) leaves half-imported data + orphan accounts. Needs a transaction/session. |
| **B7** | 🔴 med | `services/importService.ts:98` | `parseAmount` can't read the **comma-decimal amounts** that come with the auto-detected `;` delimiter (`"1.234,56" → NaN`); also `Math.abs` silently flips negatives. |
| **B8** | 🔴 high | `controllers/settingsController.ts:28` | Changing `baseCurrency` **only relabels** — stored amounts are never converted, and the CSV export filename claims the new currency while cells hold the old numbers. |
| **B9** | 🟠 med | `services/importService.ts:229` | **No duplicate detection** — re-importing the same file (or an export→import round-trip) silently doubles every transaction. |
| **B10** | 🔵 med | `services/networthService.ts:47` | Net worth ignores **outstanding credits (IOUs)** entirely; only reflected credits (via their account txn) move the needle. |
| **B15** | 🟠 med | `services/recurringService.ts:117` | **No atomic claim** on due rules — the hourly cron and a user's "Run due" (or a second replica) can `find` the same due rule before either advances `nextRun`, double-posting EMIs and double-reducing the loan. Needs `findOneAndUpdate` claiming. |
| **B21** | 🟠 med | `controllers/budgetController.ts:32` | Budget periods ignore the user's **`firstDayOfWeek` / `monthStartDay`** settings (and `budget.startDate`) — a salary-cycle or Sunday-week user sees spend in the wrong window at boundaries. |
| **B25** | 🔵 low | `services/creditService.ts:123` | Editing a reflected credit **overwrites** the linked transaction's category back to the credit category, discarding a user's manual re-categorization. |
| **B26** | 🟠 low | `services/twoFactorService.ts:201` | A **TOTP code is replayable** within its ~30s window (no used-token tracking). Email + backup codes are correctly single-use; TOTP isn't. |

---

## Invariants that hold (green regression guards)

These already behave correctly and are now locked in:

- A transfer **conserves total money** across both accounts.
- Create + delete of a transaction is a **perfect balance no-op**.
- Deleting a **reflected credit** also deletes its linked transaction (the cascade fix).
- A loan part-payment **never drives `outstanding` negative** and closes at 0.
- **Ownership isolation** — a stranger can't modify another user's loan (404).
- Running a due rule **twice in a row posts each occurrence once** (sequential idempotency).

---

### How to run

```bash
cd tests
npx vitest run src/api/edge-cases.spec.ts     # this suite
npx vitest run                                # everything
npx vite preview --outDir reports/api         # open the HTML report
```
