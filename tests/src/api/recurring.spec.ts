import { describe, it, expect } from "vitest";
import { createVerifiedUser, type TestUser } from "../harness/users";

const yesterday = () => new Date(Date.now() - 86_400_000).toISOString();
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const newAccount = async (u: TestUser, overrides: Record<string, unknown> = {}) =>
  (await u.session.http.post("/accounts", { name: "A", ...overrides })).data;

describe("Recurring — CRUD", () => {
  it("creates a rule (201) with an upcoming-occurrences preview", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u);
    const res = await u.session.http.post("/recurring", {
      type: "expense",
      amount: 100,
      account: acc._id,
      frequency: "monthly",
      startDate: inDays(5),
    });
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ type: "expense", amount: 100, frequency: "monthly" });
    expect(Array.isArray(res.data.upcoming)).toBe(true);
    expect(res.data.upcoming.length).toBeGreaterThan(0);
  });

  it("updates and deletes a rule", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u);
    const rule = (
      await u.session.http.post("/recurring", { type: "expense", amount: 100, account: acc._id, startDate: inDays(5) })
    ).data;
    const upd = await u.session.http.patch(`/recurring/${rule._id}`, { amount: 250, note: "rent" });
    expect(upd.status).toBe(200);
    expect(upd.data.amount).toBe(250);
    expect((await u.session.http.delete(`/recurring/${rule._id}`)).status).toBe(200);
  });
});

describe("Recurring — posting", () => {
  it("run posts a due occurrence, records history, and moves the balance", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u, { initialBalance: 1000 });
    const rule = (
      await u.session.http.post("/recurring", {
        type: "expense",
        amount: 200,
        account: acc._id,
        frequency: "monthly",
        startDate: yesterday(),
      })
    ).data;

    const run = await u.session.http.post(`/recurring/${rule._id}/run`);
    expect(run.status).toBe(200);
    expect(run.data.created).toBeGreaterThanOrEqual(1);

    const history = (await u.session.http.get(`/recurring/${rule._id}/transactions`)).data;
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect((await u.session.http.get(`/accounts/${acc._id}`)).data.balance).toBeLessThan(1000);
  });

  it("a loan-linked EMI reduces the loan's outstanding when the rule posts", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u, { initialBalance: 100000 });
    const loan = (await u.session.http.post("/loans", { name: "Car", outstanding: 100000, roi: 0, emi: 5000 })).data;
    const rule = (
      await u.session.http.post("/recurring", {
        type: "expense",
        amount: 5000,
        account: acc._id,
        loan: loan._id,
        frequency: "monthly",
        startDate: yesterday(),
      })
    ).data;

    const run = await u.session.http.post(`/recurring/${rule._id}/run`);
    expect(run.data.created).toBeGreaterThanOrEqual(1);

    const after = (await u.session.http.get("/loans")).data.find((l: any) => l._id === loan._id);
    expect(after.outstanding).toBe(95000); // roi 0 → the whole EMI goes to principal
  });

  it("run-all posts the user's due rules", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u);
    await u.session.http.post("/recurring", {
      type: "expense",
      amount: 50,
      account: acc._id,
      frequency: "monthly",
      startDate: yesterday(),
    });
    const run = await u.session.http.post("/recurring/run");
    expect(run.status).toBe(200);
    expect(run.data.created).toBeGreaterThanOrEqual(1);
  });

  it("post-one posts exactly one occurrence and advances the schedule", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u);
    const rule = (
      await u.session.http.post("/recurring", {
        type: "expense",
        amount: 100,
        account: acc._id,
        frequency: "monthly",
        startDate: inDays(5),
      })
    ).data;
    const before = new Date(rule.nextRun).getTime();

    const res = await u.session.http.post(`/recurring/${rule._id}/post-one`, {});
    expect(res.status).toBe(200);
    expect(new Date(res.data.nextRun).getTime()).toBeGreaterThan(before);

    const history = (await u.session.http.get(`/recurring/${rule._id}/transactions`)).data;
    expect(history.length).toBe(1);
  });

  it("skip advances the schedule without posting a transaction", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u);
    const rule = (
      await u.session.http.post("/recurring", {
        type: "expense",
        amount: 100,
        account: acc._id,
        frequency: "monthly",
        startDate: inDays(5),
      })
    ).data;
    const before = new Date(rule.nextRun).getTime();

    const res = await u.session.http.post(`/recurring/${rule._id}/skip`);
    expect(res.status).toBe(200);
    expect(new Date(res.data.nextRun).getTime()).toBeGreaterThan(before);

    const history = (await u.session.http.get(`/recurring/${rule._id}/transactions`)).data;
    expect(history.length).toBe(0);
  });
});

describe("Recurring — validation & ownership", () => {
  it("rejects a non-positive amount with 400", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u);
    expect((await u.session.http.post("/recurring", { type: "expense", amount: 0, account: acc._id })).status).toBe(400);
  });

  it("rejects a missing account with 400", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/recurring", { type: "expense", amount: 10 })).status).toBe(400);
  });

  it("404s for another user's rule", async () => {
    const owner = await createVerifiedUser();
    const acc = await newAccount(owner);
    const rule = (
      await owner.session.http.post("/recurring", { type: "expense", amount: 10, account: acc._id, startDate: inDays(5) })
    ).data;
    const stranger = await createVerifiedUser();
    expect((await stranger.session.http.post(`/recurring/${rule._id}/skip`)).status).toBe(404);
    expect((await stranger.session.http.delete(`/recurring/${rule._id}`)).status).toBe(404);
  });
});
