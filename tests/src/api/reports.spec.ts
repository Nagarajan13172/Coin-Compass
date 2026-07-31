import { describe, it, expect } from "vitest";
import { createVerifiedUser, type TestUser } from "../harness/users";
import { outboxIndex, waitForMail } from "../harness/mail";

// Wide range so results don't depend on the current calendar month.
const ALL = "?from=2000-01-01&to=2999-01-01";

async function seed(u: TestUser) {
  const acc = (await u.session.http.post("/accounts", { name: "Main" })).data;
  const cat = (await u.session.http.get("/categories?type=expense")).data[0]._id;
  await u.session.http.post("/transactions", { type: "income", amount: 300, account: acc._id });
  await u.session.http.post("/transactions", { type: "expense", amount: 100, account: acc._id, category: cat });
}

describe("Reports — summary", () => {
  it("totals income, expense and net over a range", async () => {
    const u = await createVerifiedUser();
    await seed(u);
    const res = await u.session.http.get(`/reports/summary${ALL}`);
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ income: 300, expense: 100, net: 200 });
  });
});

describe("Reports — breakdowns", () => {
  it("returns category, trend and account breakdowns as arrays", async () => {
    const u = await createVerifiedUser();
    await seed(u);

    const byCat = await u.session.http.get(`/reports/by-category${ALL}`);
    expect(byCat.status).toBe(200);
    expect(Array.isArray(byCat.data)).toBe(true);
    expect(byCat.data.length).toBeGreaterThanOrEqual(1);

    const trend = await u.session.http.get(`/reports/trend${ALL}`);
    expect(Array.isArray(trend.data)).toBe(true);

    const byAcc = await u.session.http.get(`/reports/by-account${ALL}`);
    expect(Array.isArray(byAcc.data)).toBe(true);
    expect(byAcc.data.length).toBeGreaterThanOrEqual(1);
  });

  // The grouped donut folds these rows by `group` on the client, so the field has
  // to survive the aggregation — and stay null (not absent, not "") for a category
  // with no group, or every ungrouped row would fall into the wrong bucket.
  it("carries each category's report group on the by-category rows", async () => {
    const u = await createVerifiedUser();
    const acc = (await u.session.http.post("/accounts", { name: "Main" })).data;
    const grouped = (await u.session.http.post("/categories", { name: "Chai", type: "expense", group: "food" })).data;
    const loose = (await u.session.http.post("/categories", { name: "Odd", type: "expense" })).data;
    await u.session.http.post("/transactions", { type: "expense", amount: 40, account: acc._id, category: grouped._id });
    await u.session.http.post("/transactions", { type: "expense", amount: 60, account: acc._id, category: loose._id });

    const rows = (await u.session.http.get(`/reports/by-category${ALL}`)).data as any[];
    const find = (id: string) => rows.find((r) => r.categoryId === id);
    expect(find(grouped._id).group).toBe("food");
    expect(find(loose._id)).toHaveProperty("group", null);
  });

  it("groups a seeded category under its default group", async () => {
    const u = await createVerifiedUser();
    const acc = (await u.session.http.post("/accounts", { name: "Main" })).data;
    const cats = (await u.session.http.get("/categories?type=expense")).data as any[];
    const food = cats.find((c) => c.name === "Food & Dining");
    await u.session.http.post("/transactions", { type: "expense", amount: 25, account: acc._id, category: food._id });

    const rows = (await u.session.http.get(`/reports/by-category${ALL}`)).data as any[];
    expect(rows.find((r) => r.categoryId === food._id).group).toBe("food");
  });
});

/**
 * `to` means two different things depending on the caller: the export picker
 * sends a bare day (include all of it), the Reports page sends the period's
 * exclusive ISO end. The server used to add 24h to both, which stretched every
 * window a day and made "last month" swallow the 1st of the current month.
 */
describe("Reports — range boundaries", () => {
  it("treats an ISO instant as the exclusive end, not a day to extend", async () => {
    const u = await createVerifiedUser();
    const acc = (await u.session.http.post("/accounts", { name: "Main" })).data;
    const mk = (date: string, amount: number) =>
      u.session.http.post("/transactions", { type: "expense", amount, account: acc._id, date });

    await mk("2026-06-15T00:00:00.000Z", 500); // inside June
    await mk("2026-07-01T00:00:00.000Z", 900); // the day that used to leak in

    const res = await u.session.http.get(
      "/reports/summary?from=2026-06-01T00:00:00.000Z&to=2026-07-01T00:00:00.000Z"
    );
    expect(res.data.expense).toBe(500);
  });

  it("still includes the whole final day when `to` is a bare date", async () => {
    const u = await createVerifiedUser();
    const acc = (await u.session.http.post("/accounts", { name: "Main" })).data;
    await u.session.http.post("/transactions", {
      type: "expense",
      amount: 700,
      account: acc._id,
      date: "2026-06-30T00:00:00.000Z",
    });

    const res = await u.session.http.get("/reports/summary?from=2026-06-01&to=2026-06-30");
    expect(res.data.expense).toBe(700);
  });
});

/**
 * Deposits and loan principal leave the account but stay yours. Counting them as
 * spending understated the savings rate badly (13% for a month that was ~57%).
 */
describe("Reports — consumption vs raw expense", () => {
  it("splits expense into consumption and non-consumption by category group", async () => {
    const u = await createVerifiedUser();
    const acc = (await u.session.http.post("/accounts", { name: "Main" })).data;
    const cats = (await u.session.http.get("/categories?type=expense")).data as any[];
    const food = cats.find((c) => c.name === "Food & Dining");
    const loan = cats.find((c) => c.name === "Personal Loan"); // group: debt_transfers
    const post = cats.find((c) => c.name === "Post-Office"); // group: savings

    const mk = (category: string, amount: number) =>
      u.session.http.post("/transactions", { type: "expense", amount, account: acc._id, category });
    await mk(food._id, 1000);
    await mk(loan._id, 5000);
    await mk(post._id, 2000);

    const res = await u.session.http.get(`/reports/summary${ALL}`);
    expect(res.data.expense).toBe(8000);
    expect(res.data.nonConsumption).toBe(7000); // loan + deposit
    expect(res.data.consumption).toBe(1000); // only the food
    // The two parts must always re-add to the raw total.
    expect(res.data.consumption + res.data.nonConsumption).toBe(res.data.expense);
  });
});

/**
 * A transfer is money genuinely crossing an account boundary, so the per-account
 * view must count both of its legs. It used to group only by the SOURCE account
 * and then discard transfer rows entirely, so an account funded purely by
 * transfers rendered as a row of zeroes and every other account's in/out
 * silently omitted the money it had moved.
 */
describe("Reports — by account includes transfers", () => {
  it("counts both legs of a transfer against the right accounts", async () => {
    const u = await createVerifiedUser();
    const a = (await u.session.http.post("/accounts", { name: "Main" })).data;
    const b = (await u.session.http.post("/accounts", { name: "Lent" })).data;

    await u.session.http.post("/transactions", { type: "income", amount: 10000, account: a._id });
    await u.session.http.post("/transactions", { type: "expense", amount: 2000, account: a._id });
    await u.session.http.post("/transactions", {
      type: "transfer",
      amount: 3000,
      account: a._id,
      toAccount: b._id,
    });

    const rows = (await u.session.http.get(`/reports/by-account${ALL}`)).data as any[];
    const main = rows.find((r) => r.name === "Main");
    const lent = rows.find((r) => r.name === "Lent");

    expect(main).toMatchObject({ income: 10000, expense: 2000, transferOut: 3000, transferIn: 0 });
    // The destination must appear even though it has no income/expense at all.
    expect(lent).toMatchObject({ income: 0, expense: 0, transferIn: 3000, transferOut: 0 });
  });

  it("gives a transfers-only account real figures instead of a row of zeroes", async () => {
    const u = await createVerifiedUser();
    const a = (await u.session.http.post("/accounts", { name: "Main" })).data;
    const b = (await u.session.http.post("/accounts", { name: "Lent" })).data;
    const move = (from: string, to: string, amount: number) =>
      u.session.http.post("/transactions", { type: "transfer", amount, account: from, toAccount: to });

    await move(a._id, b._id, 5000);
    await move(b._id, a._id, 1800);

    const rows = (await u.session.http.get(`/reports/by-account${ALL}`)).data as any[];
    const lent = rows.find((r) => r.name === "Lent");
    expect(lent.transferIn).toBe(5000);
    expect(lent.transferOut).toBe(1800);
    // Net movement must equal the receivable actually outstanding.
    expect(lent.transferIn - lent.transferOut).toBe(3200);
  });
});

describe("Reports — email", () => {
  it("sends a report email to the signed-in user on demand", async () => {
    const u = await createVerifiedUser();
    await seed(u);
    const before = outboxIndex();

    const res = await u.session.http.post("/reports/email-now");
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ ok: true, sentTo: u.email });

    // the email actually goes out (captured from the server's mail output)
    await waitForMail(u.email, { since: before });
  });
});
