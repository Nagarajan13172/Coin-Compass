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
