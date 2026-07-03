/**
 * Strict edge-case / specification suite.
 * ----------------------------------------
 * Unlike the per-feature CRUD suites (which assert *current* behavior), every test
 * here asserts the behavior the app is SUPPOSED to have — money conservation, no
 * orphaned references, validation that encodes intent, cross-feature consistency.
 *
 * Tests marked `it.fails(...)` are CONFIRMED DEFECTS: the body asserts the correct
 * behavior, and `.fails` records that the app currently gets it wrong — so this
 * suite stays green while documenting each bug. When a bug is fixed, its `.fails`
 * test flips red, which is the signal to delete the `.fails` marker. Each carries a
 * `BUG Bnn` tag that maps to tests/BUGS-FOUND.md.
 *
 * Plain `it(...)` tests are INVARIANTS that currently hold — regression guards that
 * must never break.
 */
import { describe, it, expect, afterAll } from "vitest";
import { createVerifiedUser, type TestUser } from "../harness/users";
import { refCount, docCount, closeDb } from "../harness/db";

afterAll(async () => {
  await closeDb();
});

// ---- tiny helpers -----------------------------------------------------------
const H = (u: TestUser) => u.session.http;

const newAccount = async (u: TestUser, overrides: Record<string, unknown> = {}) =>
  (await H(u).post("/accounts", { name: "Acct", ...overrides })).data;

const newCategory = async (u: TestUser, name: string, type: "income" | "expense" = "expense") =>
  (await H(u).post("/categories", { name, type })).data;

const expenseCategoryId = async (u: TestUser) => {
  const cats = (await H(u).get("/categories?type=expense")).data as any[];
  return cats[0]?._id as string;
};

const balanceOf = async (u: TestUser, id: string) =>
  (await H(u).get(`/accounts/${id}`)).data.balance as number;

const newLoan = async (u: TestUser, overrides: Record<string, unknown> = {}) =>
  (await H(u).post("/loans", { name: "Loan", outstanding: 5000, roi: 0, emi: 5000, ...overrides })).data;

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

// =============================================================================
// TRANSACTIONS & ACCOUNTS
// =============================================================================
describe("Transactions & Accounts — invariants", () => {
  it("[invariant] a transfer conserves total money across both accounts", async () => {
    const u = await createVerifiedUser();
    const a = await newAccount(u, { name: "A", initialBalance: 1000 });
    const b = await newAccount(u, { name: "B", initialBalance: 500 });
    const before = (await balanceOf(u, a._id)) + (await balanceOf(u, b._id));
    await H(u).post("/transactions", { type: "transfer", amount: 300, account: a._id, toAccount: b._id });
    const after = (await balanceOf(u, a._id)) + (await balanceOf(u, b._id));
    expect(after).toBe(before); // no money created or destroyed
  });

  it("[invariant] create + delete of a transaction leaves the balance exactly as it was", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u, { initialBalance: 777 });
    const t = (await H(u).post("/transactions", { type: "expense", amount: 123.45, account: acc._id })).data;
    await H(u).delete(`/transactions/${t._id}`);
    expect(await balanceOf(u, acc._id)).toBe(777);
  });

  // BUG B1 — the same-account-transfer guard exists only on CREATE; the UPDATE
  // schema (transactionUpdateSchema) has no refine, so a normal expense can be
  // PATCHed into a transfer whose source == destination.
  it("[fixed B1] PATCH must reject turning a transaction into a same-account transfer", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u, { initialBalance: 1000 });
    const t = (await H(u).post("/transactions", { type: "expense", amount: 100, account: acc._id })).data;
    const res = await H(u).patch(`/transactions/${t._id}`, { type: "transfer", toAccount: acc._id });
    expect(res.status).toBe(400);
  });

  // BUG B1 (variant) — PATCH into a transfer with NO destination account also slips
  // through; the money then leaves `account` (transferOut) with no matching transferIn.
  it("[fixed B1] PATCH must reject turning a transaction into a transfer with no destination", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u, { initialBalance: 1000 });
    const t = (await H(u).post("/transactions", { type: "expense", amount: 100, account: acc._id })).data;
    const res = await H(u).patch(`/transactions/${t._id}`, { type: "transfer", toAccount: null });
    expect(res.status).toBe(400);
  });

  // BUG B3 — a transaction's currency is independent of its account's currency, and
  // balances sum raw amounts across currencies. A USD expense on an INR account is
  // summed as if it were INR. Intent: reject (or convert) a mismatched currency.
  it.fails("[BUG B3] a transaction whose currency differs from its account should be rejected", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u, { initialBalance: 0, currency: "INR" });
    const res = await H(u).post("/transactions", { type: "expense", amount: 100, account: acc._id, currency: "USD" });
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// ACCOUNT DELETION — cascades to loans & credits
// =============================================================================
describe("Account force-delete — must not corrupt linked loans/credits", () => {
  // BUG B2 — force-deleting an account runs Transaction.deleteMany, which BYPASSES
  // the loan-reversal logic in deleteTransaction. A loan whose EMI lived on that
  // account keeps its reduced outstanding forever.
  it("[fixed B2] force-deleting an account restores the outstanding of loans its transactions paid", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u, { initialBalance: 100_000 });
    const loan = await newLoan(u, { outstanding: 10_000, roi: 0, emi: 0 });
    // A loan payment of 3000 → principal 3000 → outstanding 7000.
    await H(u).post("/transactions", { type: "expense", amount: 3000, account: acc._id, loan: loan._id });
    await H(u).delete(`/accounts/${acc._id}?force=true`);
    const after = (await H(u).get("/loans")).data.find((l: any) => l._id === loan._id);
    expect(after.outstanding).toBe(10_000); // payment reversed with the account
  });

  // BUG B2 (variant) — the reflected credit's transaction is deleted by deleteMany,
  // but the Credit doc is left pointing at the now-deleted transaction.
  it("[fixed B2] force-deleting an account must not leave a credit referencing a deleted transaction", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u, { initialBalance: 100_000 });
    const credit = (
      await H(u).post("/credits", {
        person: "Orphan Test",
        direction: "given",
        amount: 500,
        account: acc._id,
        reflected: true,
      })
    ).data;
    expect(credit.transaction).toBeTruthy();
    await H(u).delete(`/accounts/${acc._id}?force=true`);
    const after = (await H(u).get("/credits")).data.find((c: any) => c._id === credit._id);
    // The credit must not dangle: either gone, or unlinked (transaction === null).
    expect(after?.transaction ?? null).toBeNull();
  });
});

// =============================================================================
// CREDITS
// =============================================================================
describe("Credits — linkage & edits", () => {
  // INVARIANT (the fix we already shipped): deleting a reflected credit removes its
  // linked transaction too.
  it("[invariant] deleting a reflected credit also deletes its linked transaction", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u, { initialBalance: 1000 });
    const credit = (
      await H(u).post("/credits", { person: "Sam", direction: "given", amount: 200, account: acc._id, reflected: true })
    ).data;
    const txnId = credit.transaction as string;
    expect((await H(u).get(`/transactions/${txnId}`)).status).toBe(200);
    await H(u).delete(`/credits/${credit._id}`);
    expect((await H(u).get(`/transactions/${txnId}`)).status).toBe(404);
  });

  // BUG B24 — updateCredit merges account with `patch.account ?? old`, so passing
  // account:null (to clear it on a non-reflected credit) is treated as "unchanged".
  it("[fixed B24] clearing the account on a non-reflected credit should actually clear it", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u, { initialBalance: 1000 });
    const credit = (
      await H(u).post("/credits", { person: "Kim", direction: "given", amount: 200, account: acc._id, reflected: false })
    ).data;
    await H(u).patch(`/credits/${credit._id}`, { account: null });
    const after = (await H(u).get("/credits")).data.find((c: any) => c._id === credit._id);
    expect(after.account ?? null).toBeNull();
  });
});

// =============================================================================
// LOANS
// =============================================================================
describe("Loans — validation & math", () => {
  it("[invariant] a part-payment never drives outstanding below zero and closes the loan", async () => {
    const u = await createVerifiedUser();
    const loan = await newLoan(u, { outstanding: 1000, roi: 0, emi: 0 });
    const after = (await H(u).post(`/loans/${loan._id}/pay`, { amount: 5000 })).data;
    expect(after.outstanding).toBe(0);
    expect(after.status).toBe("closed");
  });

  it("[invariant] a stranger cannot modify another user's loan", async () => {
    const owner = await createVerifiedUser();
    const loan = await newLoan(owner);
    const stranger = await createVerifiedUser();
    expect((await stranger.session.http.patch(`/loans/${loan._id}`, { name: "hijack" })).status).toBe(404);
  });

  // BUG B17 — an EMI that is ≤ the monthly interest can never reduce principal; the
  // loan amortizes forever. The API accepts it with no warning.
  it("[fixed B17] a non-amortizing loan (emi ≤ monthly interest) should be rejected", async () => {
    const u = await createVerifiedUser();
    // outstanding 1,000,000 at 24%/yr → monthly interest 20,000; emi 15,000 < that.
    const res = await H(u).post("/loans", { name: "Trap", outstanding: 1_000_000, roi: 24, emi: 15_000 });
    expect(res.status).toBe(400);
  });

  // BUG B17 (variant) — startDate after endDate is accepted.
  it("[fixed B17] a loan whose startDate is after its endDate should be rejected", async () => {
    const u = await createVerifiedUser();
    const res = await H(u).post("/loans", {
      name: "Backwards",
      outstanding: 1000,
      startDate: "2030-01-01",
      endDate: "2020-01-01",
    });
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// RECURRING  (and its cross-feature link to loans)
// =============================================================================
describe("Recurring — schedule & loan cross-verification", () => {
  it("[invariant] running a due rule twice in a row posts the occurrence only once", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u, { initialBalance: 10_000 });
    const rule = (
      await H(u).post("/recurring", {
        type: "expense",
        amount: 100,
        account: acc._id,
        frequency: "monthly",
        interval: 1,
        startDate: daysAgo(5),
      })
    ).data;
    const first = (await H(u).post(`/recurring/${rule._id}/run`)).data.created;
    const second = (await H(u).post(`/recurring/${rule._id}/run`)).data.created;
    expect(first).toBeGreaterThanOrEqual(1);
    expect(second).toBe(0); // nextRun already advanced past now
  });

  // BUG B18 — recurringSchema has no transfer refine, so a recurring transfer can be
  // same-account (money vanishes into transferOut with no transferIn each run).
  it("[fixed B18] a recurring same-account transfer should be rejected", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u);
    const res = await H(u).post("/recurring", {
      type: "transfer",
      amount: 100,
      account: acc._id,
      toAccount: acc._id,
      frequency: "monthly",
    });
    expect(res.status).toBe(400);
  });

  // BUG B18 (variant) — a recurring transfer with no destination is accepted.
  it("[fixed B18] a recurring transfer with no destination account should be rejected", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u);
    const res = await H(u).post("/recurring", {
      type: "transfer",
      amount: 100,
      account: acc._id,
      frequency: "monthly",
    });
    expect(res.status).toBe(400);
  });

  // BUG B14 — the `loan` link on a recurring rule is never checked for ownership,
  // and listRecurring populates the loan name → cross-user disclosure (IDOR).
  it.fails("[BUG B14] a recurring rule may not link to another user's loan", async () => {
    const victim = await createVerifiedUser();
    const victimLoan = await newLoan(victim, { name: "Victim Secret Loan" });
    const attacker = await createVerifiedUser();
    const acc = await newAccount(attacker);
    const res = await H(attacker).post("/recurring", {
      type: "expense",
      amount: 100,
      account: acc._id,
      frequency: "monthly",
      loan: victimLoan._id,
    });
    expect(res.status).toBe(400);
  });

  // BUG B11 — a recurring EMI keeps posting after its loan is fully paid off (the
  // rule is only deactivated by endDate, never by loan closure). Extra EMIs debit
  // the account with zero loan effect.
  it.fails("[BUG B11] a recurring EMI stops charging the account once the loan is paid off", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u, { initialBalance: 100_000 });
    const loan = await newLoan(u, { outstanding: 5000, roi: 0, emi: 5000 });
    const rule = (
      await H(u).post("/recurring", {
        type: "expense",
        amount: 5000,
        account: acc._id,
        frequency: "monthly",
        interval: 1,
        startDate: daysAgo(40), // ⇒ two occurrences are due at once
        loan: loan._id,
      })
    ).data;
    await H(u).post(`/recurring/${rule._id}/run`);
    // Only the ₹5000 that actually paid the loan should have left the account.
    expect(await balanceOf(u, acc._id)).toBe(95_000);
  });

  // BUG B13 — the final EMI posts the full fixed amount even though only the payoff
  // (principal+interest) applies to the loan; the excess over-debits the account and
  // isn't stored on the txn, so it can't be reversed.
  it.fails("[BUG B13] the final EMI debits only the payoff amount, not the full fixed EMI", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u, { initialBalance: 100_000 });
    const loan = await newLoan(u, { outstanding: 5000, roi: 0, emi: 10_000 });
    const rule = (
      await H(u).post("/recurring", {
        type: "expense",
        amount: 10_000, // bigger than the remaining balance
        account: acc._id,
        frequency: "monthly",
        startDate: daysAgo(1),
        loan: loan._id,
      })
    ).data;
    await H(u).post(`/recurring/${rule._id}/post-one`, {});
    const txns = (await H(u).get(`/recurring/${rule._id}/transactions`)).data as any[];
    const posted = txns[0];
    expect(posted.amount).toBe((posted.loanPrincipal ?? 0) + (posted.loanInterest ?? 0));
  });

  // BUG B12 — addMonths uses setMonth, so a monthly rule anchored on the 31st skips
  // February entirely (Jan 31 → Mar 3) and permanently shifts the day.
  it.fails("[BUG B12] a monthly rule anchored on the 31st keeps its 2nd occurrence in February", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u);
    const rule = (
      await H(u).post("/recurring", {
        type: "expense",
        amount: 100,
        account: acc._id,
        frequency: "monthly",
        interval: 1,
        startDate: "2030-01-31T00:00:00.000Z",
      })
    ).data;
    // upcoming[0] = Jan 31; upcoming[1] should be in Feb, not skip to March.
    const second = new Date(rule.upcoming[1]);
    expect(second.getTime()).toBeLessThan(Date.UTC(2030, 2, 1)); // before 1 March
  });

  // BUG B16 — deleteLoan does not cascade: transactions keep a dangling loan ref and
  // any linked recurring rule stays active.
  it("[fixed B16] deleting a loan leaves no transaction referencing the deleted loan id", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u, { initialBalance: 100_000 });
    const loan = await newLoan(u, { outstanding: 5000, roi: 0, emi: 1000 });
    await H(u).post("/transactions", { type: "expense", amount: 1000, account: acc._id, loan: loan._id });
    await H(u).delete(`/loans/${loan._id}`);
    expect(await refCount("transactions", "loan", loan._id)).toBe(0);
  });
});

// =============================================================================
// BUDGETS
// =============================================================================
describe("Budgets — scope & aggregation", () => {
  // BUG B19 — deleting a budget's category turns categoryIdOf(null) into "no filter",
  // so the category-scoped budget silently starts counting EVERY expense.
  it("[fixed B19] a budget whose category was deleted must not start counting all expenses", async () => {
    const u = await createVerifiedUser();
    const food = await newCategory(u, "Food");
    const other = await newCategory(u, "Rent");
    await H(u).post("/budgets", { category: food._id, amount: 5000, period: "monthly" });
    // Spend in an UNRELATED category.
    await H(u).post("/transactions", { type: "expense", amount: 4000, account: (await newAccount(u))._id, category: other._id });
    // Delete the budget's category (force clears it off transactions).
    await H(u).delete(`/categories/${food._id}?force=true`);
    // The orphaned budget is removed with its category — either way, no surviving
    // budget may claim the unrelated ₹4000 as its own spend.
    const budgets = (await H(u).get("/budgets")).data as any[];
    expect(budgets.some((b) => b.spent === 4000)).toBe(false);
  });

  // BUG B22 — budget.category is only shape-validated; a budget can reference another
  // user's category and listBudgets populates it (info leak) with meaningless spend.
  it.fails("[BUG B22] a budget may not reference another user's category", async () => {
    const victim = await createVerifiedUser();
    const victimCat = await newCategory(victim, "Victim Category");
    const attacker = await createVerifiedUser();
    const res = await H(attacker).post("/budgets", { category: victimCat._id, amount: 1000, period: "monthly" });
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// GOALS
// =============================================================================
describe("Goals — achievement tracking", () => {
  it("[invariant] contributing past the target marks the goal achieved", async () => {
    const u = await createVerifiedUser();
    const goal = (await H(u).post("/goals", { name: "Trip", targetAmount: 1000 })).data;
    await H(u).post(`/goals/${goal._id}/contribute`, { amount: 1200 });
    const after = (await H(u).get("/goals")).data.find((g: any) => g._id === goal._id);
    expect(after.achievedAt).toBeTruthy();
    expect(after.complete).toBe(true);
  });

  // BUG B23 — updateGoal uses a raw findOneAndUpdate and never recomputes achievedAt,
  // so editing savedAmount above the target leaves achievedAt stale (null).
  it("[fixed B23] editing savedAmount above the target should stamp achievedAt", async () => {
    const u = await createVerifiedUser();
    const goal = (await H(u).post("/goals", { name: "Car", targetAmount: 1000 })).data;
    await H(u).patch(`/goals/${goal._id}`, { savedAmount: 1500 });
    const after = (await H(u).get("/goals")).data.find((g: any) => g._id === goal._id);
    expect(after.achievedAt).toBeTruthy();
  });
});

// =============================================================================
// REPORTS
// =============================================================================
describe("Reports — date-range boundaries", () => {
  // BUG B4 — reports use `date < end` where end = midnight of the `to` day, so every
  // transaction on the final day of the range is dropped from summary/category/trend/
  // export.
  it("[fixed B4] a report's `to` date must include transactions dated on that day", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u);
    await H(u).post("/transactions", {
      type: "expense",
      amount: 500,
      account: acc._id,
      date: "2026-01-31T10:00:00.000Z",
    });
    const summary = (await H(u).get("/reports/summary?from=2026-01-01&to=2026-01-31")).data;
    expect(summary.expense).toBe(500);
  });
});

// =============================================================================
// DOCUMENTED-BUT-NOT-YET-AUTOMATED findings (see tests/BUGS-FOUND.md)
// These are real, verified defects that need a product decision or a heavier test
// harness (CSV upload / multi-currency FX / concurrency). Kept as visible skips so
// they aren't silently forgotten.
// =============================================================================
describe("Known gaps — documented, pending decision", () => {
  it.skip("[GAP B5] net worth must convert (not raw-sum) balances across currencies", () => {});
  it.skip("[GAP B6] import must be atomic — a mid-file error leaves no orphan accounts/categories", () => {});
  it.skip("[GAP B7] import must parse ';'-delimited comma-decimal amounts ('1.234,56')", () => {});
  it.skip("[GAP B8] changing baseCurrency must convert stored amounts, not just relabel", () => {});
  it.skip("[GAP B9] re-importing the same file must not silently double every transaction", () => {});
  it.skip("[GAP B10] net worth should account for outstanding credits (IOUs)", () => {});
  it.skip("[GAP B15] concurrent 'run due' + cron must post each occurrence exactly once", () => {});
  it.skip("[GAP B21] budgets must honor firstDayOfWeek / monthStartDay period anchoring", () => {});
  it.skip("[GAP B25] editing a reflected credit must not overwrite a user-set category", () => {});
  it.skip("[GAP B26] a TOTP code must not be replayable within its 30s window", () => {});
});
