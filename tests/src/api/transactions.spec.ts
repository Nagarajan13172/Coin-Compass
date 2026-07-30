import { describe, it, expect } from "vitest";
import { createVerifiedUser, type TestUser } from "../harness/users";

const newAccount = async (u: TestUser, overrides: Record<string, unknown> = {}) =>
  (await u.session.http.post("/accounts", { name: "Acct", ...overrides })).data;

const balanceOf = async (u: TestUser, id: string) =>
  (await u.session.http.get(`/accounts/${id}`)).data.balance as number;

const expenseCategoryId = async (u: TestUser) => {
  const cats = (await u.session.http.get("/categories?type=expense")).data as any[];
  return cats[0]?._id as string | undefined;
};

describe("Transactions — CRUD", () => {
  it("creates an expense (201) and returns it populated", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u);
    const category = await expenseCategoryId(u);
    const res = await u.session.http.post("/transactions", {
      type: "expense",
      amount: 120,
      account: acc._id,
      category,
      note: "Lunch",
    });
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ type: "expense", amount: 120, note: "Lunch" });
    expect(res.data.account).toMatchObject({ name: acc.name }); // populated ref
  });

  it("lists transactions with pagination metadata", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u);
    for (let i = 0; i < 3; i++) {
      await u.session.http.post("/transactions", { type: "expense", amount: 10 + i, account: acc._id });
    }
    const res = await u.session.http.get("/transactions");
    expect(res.status).toBe(200);
    expect(res.data.total).toBeGreaterThanOrEqual(3);
    expect(res.data).toHaveProperty("pages");
    expect(Array.isArray(res.data.items)).toBe(true);
  });

  it("gets, updates, and deletes a transaction", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u);
    const t = (await u.session.http.post("/transactions", { type: "expense", amount: 50, account: acc._id })).data;

    expect((await u.session.http.get(`/transactions/${t._id}`)).status).toBe(200);
    const upd = await u.session.http.patch(`/transactions/${t._id}`, { amount: 75, note: "fixed" });
    expect(upd.status).toBe(200);
    expect(upd.data.amount).toBe(75);
    expect((await u.session.http.delete(`/transactions/${t._id}`)).status).toBe(200);
    expect((await u.session.http.get(`/transactions/${t._id}`)).status).toBe(404);
  });
});

describe("Transactions — balance side-effects", () => {
  it("expense decreases and income increases the account balance", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u, { initialBalance: 1000 });
    await u.session.http.post("/transactions", { type: "expense", amount: 200, account: acc._id });
    expect(await balanceOf(u, acc._id)).toBe(800);
    await u.session.http.post("/transactions", { type: "income", amount: 500, account: acc._id });
    expect(await balanceOf(u, acc._id)).toBe(1300);
  });

  it("a transfer moves money between two accounts", async () => {
    const u = await createVerifiedUser();
    const a = await newAccount(u, { name: "A", initialBalance: 1000 });
    const b = await newAccount(u, { name: "B", initialBalance: 0 });
    const res = await u.session.http.post("/transactions", {
      type: "transfer",
      amount: 300,
      account: a._id,
      toAccount: b._id,
    });
    expect(res.status).toBe(201);
    expect(await balanceOf(u, a._id)).toBe(700);
    expect(await balanceOf(u, b._id)).toBe(300);
  });

  it("deleting a transaction restores the balance", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u, { initialBalance: 500 });
    const t = (await u.session.http.post("/transactions", { type: "expense", amount: 100, account: acc._id })).data;
    expect(await balanceOf(u, acc._id)).toBe(400);
    await u.session.http.delete(`/transactions/${t._id}`);
    expect(await balanceOf(u, acc._id)).toBe(500);
  });

  it("editing the amount updates the balance", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u, { initialBalance: 500 });
    const t = (await u.session.http.post("/transactions", { type: "expense", amount: 100, account: acc._id })).data;
    await u.session.http.patch(`/transactions/${t._id}`, { amount: 250 });
    expect(await balanceOf(u, acc._id)).toBe(250);
  });
});

describe("Transactions — filtering & search", () => {
  it("filters by type and by account", async () => {
    const u = await createVerifiedUser();
    const a = await newAccount(u, { name: "A" });
    const b = await newAccount(u, { name: "B" });
    await u.session.http.post("/transactions", { type: "expense", amount: 10, account: a._id });
    await u.session.http.post("/transactions", { type: "income", amount: 20, account: a._id });
    await u.session.http.post("/transactions", { type: "expense", amount: 30, account: b._id });

    const income = (await u.session.http.get("/transactions?type=income")).data;
    expect(income.items.every((t: any) => t.type === "income")).toBe(true);

    const onB = (await u.session.http.get(`/transactions?account=${b._id}`)).data;
    expect(onB.total).toBe(1);
    expect(onB.items.every((t: any) => String(t.account._id ?? t.account) === b._id)).toBe(true);
  });

  it("searches by note text", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u);
    await u.session.http.post("/transactions", { type: "expense", amount: 10, account: acc._id, note: "Coffee at Starbucks" });
    await u.session.http.post("/transactions", { type: "expense", amount: 20, account: acc._id, note: "Groceries" });

    const res = (await u.session.http.get("/transactions?search=starbucks")).data;
    expect(res.total).toBe(1);
    expect(res.items[0].note).toMatch(/Starbucks/);
  });
});

describe("Transactions — validation", () => {
  it("rejects a non-positive amount with 400", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u);
    expect((await u.session.http.post("/transactions", { type: "expense", amount: 0, account: acc._id })).status).toBe(400);
    expect((await u.session.http.post("/transactions", { type: "expense", amount: -5, account: acc._id })).status).toBe(400);
  });

  it("rejects a transfer without a destination account with 400", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u);
    expect((await u.session.http.post("/transactions", { type: "transfer", amount: 50, account: acc._id })).status).toBe(400);
  });

  it("rejects a transfer whose source and destination are the same account with 400", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u);
    const res = await u.session.http.post("/transactions", {
      type: "transfer",
      amount: 50,
      account: acc._id,
      toAccount: acc._id,
    });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid account id with 400", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/transactions", { type: "expense", amount: 10, account: "not-an-id" })).status).toBe(400);
  });

  it("404s for another user's transaction (ownership isolation)", async () => {
    const owner = await createVerifiedUser();
    const acc = await newAccount(owner);
    const t = (await owner.session.http.post("/transactions", { type: "expense", amount: 10, account: acc._id })).data;
    const stranger = await createVerifiedUser();
    expect((await stranger.session.http.get(`/transactions/${t._id}`)).status).toBe(404);
  });
});

/**
 * An account's ledger is every movement of that account — including transfers
 * that LAND in it, which name it on `toAccount` rather than `account`. Filtering
 * on `account` alone used to hide those, so a credit settlement arriving in your
 * bank was missing from the bank's own view (and from its per-day balances).
 */
describe("Transactions — account filter covers both transfer legs", () => {
  it("includes a transfer that landed IN the account, not just ones that left it", async () => {
    const u = await createVerifiedUser();
    const a = await newAccount(u, { name: "A", initialBalance: 1000 });
    const b = await newAccount(u, { name: "B" });
    await u.session.http.post("/transactions", {
      type: "transfer",
      amount: 300,
      account: a._id,
      toAccount: b._id,
    });

    const onB = (await u.session.http.get(`/transactions?account=${b._id}`)).data;
    expect(onB.total).toBe(1);
    const onA = (await u.session.http.get(`/transactions?account=${a._id}`)).data;
    expect(onA.total).toBe(1); // the outgoing leg still matches
  });

  it("matches either leg for a comma-separated list of accounts, without duplicating", async () => {
    const u = await createVerifiedUser();
    const a = await newAccount(u, { name: "A", initialBalance: 1000 });
    const b = await newAccount(u, { name: "B" });
    const c = await newAccount(u, { name: "C", initialBalance: 500 });
    await u.session.http.post("/transactions", {
      type: "transfer",
      amount: 300,
      account: a._id,
      toAccount: b._id,
    });
    await u.session.http.post("/transactions", { type: "expense", amount: 40, account: c._id });

    const res = (await u.session.http.get(`/transactions?account=${a._id},${b._id}`)).data;
    expect(res.total).toBe(1); // the one transfer, counted once despite matching both ids
  });

  it("combines with a search filter (both clauses need an $or of their own)", async () => {
    const u = await createVerifiedUser();
    const a = await newAccount(u, { name: "A", initialBalance: 1000 });
    const b = await newAccount(u, { name: "B", initialBalance: 1000 });
    await u.session.http.post("/transactions", {
      type: "expense", amount: 10, account: a._id, note: "Coffee",
    });
    await u.session.http.post("/transactions", {
      type: "expense", amount: 20, account: a._id, note: "Groceries",
    });
    await u.session.http.post("/transactions", {
      type: "expense", amount: 30, account: b._id, note: "Coffee",
    });

    const res = (await u.session.http.get(`/transactions?account=${a._id}&search=coffee`)).data;
    expect(res.total).toBe(1);
    expect(res.items[0].note).toBe("Coffee");
  });

  it("keeps the filtered summary's count in step with the list's total", async () => {
    const u = await createVerifiedUser();
    const a = await newAccount(u, { name: "A", initialBalance: 1000 });
    const b = await newAccount(u, { name: "B" });
    await u.session.http.post("/transactions", {
      type: "transfer", amount: 300, account: a._id, toAccount: b._id,
    });

    const list = (await u.session.http.get(`/transactions?account=${b._id}`)).data;
    const sum = (await u.session.http.get(`/transactions/summary?account=${b._id}`)).data;
    expect(sum.count).toBe(list.total);
    expect(sum.income).toBe(0); // a transfer is neither in nor out
    expect(sum.expense).toBe(0);
  });
});

/**
 * GET /transactions/balance anchors the Transactions page's per-day end-of-day
 * balances. It must report EVERY account separately (a day that touched two
 * accounts has to show where each landed) with both transfer legs applied — the
 * grand total alone hides credits entirely, since those are modelled as transfers.
 */
describe("Transactions — ledger balance snapshot", () => {
  const snapshot = async (u: TestUser, asOf?: string) =>
    (await u.session.http.get(`/transactions/balance${asOf ? `?asOf=${asOf}` : ""}`)).data as {
      balance: number;
      byAccount: Record<string, number>;
    };

  it("breaks the balance down per account, summing to the grand total", async () => {
    const u = await createVerifiedUser();
    const a = await newAccount(u, { name: "A", initialBalance: 1000 });
    const b = await newAccount(u, { name: "B", initialBalance: 500 });
    await u.session.http.post("/transactions", { type: "expense", amount: 200, account: a._id });
    await u.session.http.post("/transactions", { type: "income", amount: 50, account: b._id });

    const snap = await snapshot(u);
    expect(snap.byAccount[a._id]).toBe(800);
    expect(snap.byAccount[b._id]).toBe(550);
    expect(snap.balance).toBe(1350);
    expect(Object.values(snap.byAccount).reduce((s, n) => s + n, 0)).toBe(snap.balance);
  });

  it("applies both legs of a transfer per account while the total stays flat", async () => {
    const u = await createVerifiedUser();
    const a = await newAccount(u, { name: "A", initialBalance: 1000 });
    const b = await newAccount(u, { name: "B", initialBalance: 0 });
    const before = await snapshot(u);
    await u.session.http.post("/transactions", {
      type: "transfer", amount: 300, account: a._id, toAccount: b._id,
    });

    const after = await snapshot(u);
    expect(after.byAccount[a._id]).toBe(700);
    expect(after.byAccount[b._id]).toBe(300);
    expect(after.balance).toBe(before.balance); // moving your own money changes nothing
  });

  it("matches the per-account balances /accounts reports", async () => {
    const u = await createVerifiedUser();
    const a = await newAccount(u, { name: "A", initialBalance: 1000 });
    const b = await newAccount(u, { name: "B", initialBalance: 0 });
    await u.session.http.post("/transactions", { type: "expense", amount: 120, account: a._id });
    await u.session.http.post("/transactions", {
      type: "transfer", amount: 300, account: a._id, toAccount: b._id,
    });

    const snap = await snapshot(u);
    for (const acc of (await u.session.http.get("/accounts")).data as any[]) {
      expect(snap.byAccount[acc._id]).toBe(acc.balance);
    }
  });

  it("reads each account as it stood at ?asOf, exclusive of that instant", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u, { name: "A", initialBalance: 1000 });
    await u.session.http.post("/transactions", {
      type: "expense", amount: 100, account: acc._id, date: "2026-07-10T00:00:00.000Z",
    });
    await u.session.http.post("/transactions", {
      type: "expense", amount: 400, account: acc._id, date: "2026-07-20T00:00:00.000Z",
    });

    expect((await snapshot(u, "2026-07-15T00:00:00.000Z")).byAccount[acc._id]).toBe(900);
    expect((await snapshot(u, "2026-07-20T00:00:00.000Z")).byAccount[acc._id]).toBe(900);
    expect((await snapshot(u, "2026-07-21T00:00:00.000Z")).byAccount[acc._id]).toBe(500);
    expect((await snapshot(u)).byAccount[acc._id]).toBe(500);
  });

  it("shows a lent credit as bank down / Money Lent up, with the total unchanged", async () => {
    const u = await createVerifiedUser();
    const b = await newAccount(u, { name: "Bank", type: "bank", initialBalance: 50_000 });
    const before = await snapshot(u);
    expect(
      (await u.session.http.post("/credits", {
        person: "Ravi", direction: "given", amount: 20_000, account: b._id, reflected: true,
      })).status
    ).toBe(201);

    const lentId = ((await u.session.http.get("/accounts")).data as any[]).find(
      (a) => a.name === "Money Lent"
    )._id as string;
    const after = await snapshot(u);
    // The grand total can't see this at all — which is exactly why the page needs
    // the per-account breakdown to make a credit visible.
    expect(after.balance).toBe(before.balance);
    expect(after.byAccount[b._id]).toBe(30_000);
    expect(after.byAccount[lentId]).toBe(20_000);
  });

  it("shows a settled credit as Money Lent down / bank up", async () => {
    const u = await createVerifiedUser();
    const b = await newAccount(u, { name: "Bank", type: "bank", initialBalance: 50_000 });
    await u.session.http.post("/credits", {
      person: "Ravi", direction: "given", amount: 20_000, account: b._id, reflected: true,
    });
    await u.session.http.post("/credits", {
      person: "Ravi", direction: "received", amount: 20_000, account: b._id, reflected: true,
    });

    const lentId = ((await u.session.http.get("/accounts")).data as any[]).find(
      (a) => a.name === "Money Lent"
    )._id as string;
    const snap = await snapshot(u);
    expect(snap.byAccount[b._id]).toBe(50_000); // back where it started
    expect(snap.byAccount[lentId]).toBe(0); // nothing outstanding
  });

  it("reports an untouched account at its initial balance", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u, { name: "Idle", initialBalance: 777 });
    expect((await snapshot(u)).byAccount[acc._id]).toBe(777);
  });

  it("never leaks another user's accounts into the breakdown", async () => {
    const owner = await createVerifiedUser();
    const mine = await newAccount(owner, { name: "Mine", initialBalance: 100 });
    const stranger = await createVerifiedUser();
    const theirs = await newAccount(stranger, { name: "Theirs", initialBalance: 9999 });

    // Exactly the owner's own accounts — no more (the stranger's), no fewer
    // (a signup-seeded account the owner never touched still belongs to them).
    const ownIds = ((await owner.session.http.get("/accounts")).data as any[]).map((a) => a._id);
    const snap = await snapshot(owner);
    expect(Object.keys(snap.byAccount).sort()).toEqual([...ownIds].sort());
    expect(ownIds).toContain(mine._id);
    expect(snap.byAccount[theirs._id]).toBeUndefined();
    expect(snap.balance).toBe(100); // the stranger's 9,999 is nowhere in the total
  });
});
