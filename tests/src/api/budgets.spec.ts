import { describe, it, expect } from "vitest";
import { createVerifiedUser, type TestUser } from "../harness/users";
import { newSession } from "../harness/http";

const expenseCategoryId = async (u: TestUser) =>
  (await u.session.http.get("/categories?type=expense")).data[0]._id as string;

describe("Budgets — CRUD", () => {
  it("creates a budget (201) with computed progress fields", async () => {
    const u = await createVerifiedUser();
    const category = await expenseCategoryId(u);
    const res = await u.session.http.post("/budgets", { category, amount: 5000 });
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ amount: 5000, period: "monthly", over: false });
    expect(res.data).toHaveProperty("spent");
    expect(res.data).toHaveProperty("remaining");
    expect(res.data).toHaveProperty("percent");
  });

  it("lists budgets", async () => {
    const u = await createVerifiedUser();
    await u.session.http.post("/budgets", { amount: 1000 });
    const res = await u.session.http.get("/budgets");
    expect(res.status).toBe(200);
    expect(res.data.length).toBeGreaterThanOrEqual(1);
  });

  it("updates a budget", async () => {
    const u = await createVerifiedUser();
    const b = (await u.session.http.post("/budgets", { amount: 1000 })).data;
    const res = await u.session.http.patch(`/budgets/${b._id}`, { amount: 2000, period: "weekly" });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ amount: 2000, period: "weekly" });
  });

  it("deletes a budget", async () => {
    const u = await createVerifiedUser();
    const b = (await u.session.http.post("/budgets", { amount: 1000 })).data;
    expect((await u.session.http.delete(`/budgets/${b._id}`)).status).toBe(200);
    expect((await u.session.http.patch(`/budgets/${b._id}`, { amount: 1 })).status).toBe(404);
  });
});

describe("Budgets — spend tracking", () => {
  it("computes spent/remaining and flags over-spend for a category budget", async () => {
    const u = await createVerifiedUser();
    const category = await expenseCategoryId(u);
    const acc = (await u.session.http.post("/accounts", { name: "A" })).data;
    await u.session.http.post("/budgets", { category, amount: 100 });
    await u.session.http.post("/transactions", { type: "expense", amount: 150, account: acc._id, category });

    const budget = (await u.session.http.get("/budgets")).data.find((b: any) => b.amount === 100);
    expect(budget.spent).toBe(150);
    expect(budget.remaining).toBe(-50);
    expect(budget.percent).toBe(150);
    expect(budget.over).toBe(true);
  });
});

describe("Budgets — validation & ownership", () => {
  it("rejects a non-positive amount with 400", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/budgets", { amount: 0 })).status).toBe(400);
  });

  it("rejects an invalid period with 400", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/budgets", { amount: 100, period: "daily" })).status).toBe(400);
  });

  it("404s for another user's budget", async () => {
    const owner = await createVerifiedUser();
    const b = (await owner.session.http.post("/budgets", { amount: 100 })).data;
    const stranger = await createVerifiedUser();
    expect((await stranger.session.http.delete(`/budgets/${b._id}`)).status).toBe(404);
  });

  it("requires authentication", async () => {
    expect((await newSession().http.get("/budgets")).status).toBe(401);
  });
});
