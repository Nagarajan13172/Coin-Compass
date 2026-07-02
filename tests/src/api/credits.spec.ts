import { describe, it, expect } from "vitest";
import { createVerifiedUser, type TestUser } from "../harness/users";

const newAccount = async (u: TestUser, overrides: Record<string, unknown> = {}) =>
  (await u.session.http.post("/accounts", { name: "A", ...overrides })).data;

describe("Credits — CRUD", () => {
  it("creates an unreflected IOU (201) with no linked transaction", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.post("/credits", { person: "Alice", direction: "given", amount: 500 });
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ person: "Alice", direction: "given", amount: 500, reflected: false });
    expect(res.data.transaction).toBeNull();
  });

  it("lists, updates, and deletes a credit", async () => {
    const u = await createVerifiedUser();
    const c = (await u.session.http.post("/credits", { person: "Bob", direction: "received", amount: 200 })).data;
    expect((await u.session.http.get("/credits")).data.some((x: any) => x._id === c._id)).toBe(true);
    const upd = await u.session.http.patch(`/credits/${c._id}`, { amount: 250 });
    expect(upd.data.amount).toBe(250);
    expect((await u.session.http.delete(`/credits/${c._id}`)).status).toBe(200);
  });
});

describe("Credits — reflection into balances", () => {
  it("a reflected 'given' credit creates a linked expense and moves the account balance", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u, { initialBalance: 1000 });
    const res = await u.session.http.post("/credits", {
      person: "Carol",
      direction: "given",
      amount: 300,
      account: acc._id,
      reflected: true,
    });
    expect(res.status).toBe(201);
    expect(res.data.transaction).toBeTruthy();
    expect((await u.session.http.get(`/accounts/${acc._id}`)).data.balance).toBe(700);
  });

  it("rejects reflecting without an account (400)", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.post("/credits", { person: "X", direction: "given", amount: 100, reflected: true });
    expect(res.status).toBe(400);
  });

  it("un-reflecting deletes the linked transaction and restores the balance", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u, { initialBalance: 1000 });
    const c = (
      await u.session.http.post("/credits", { person: "Dee", direction: "given", amount: 300, account: acc._id, reflected: true })
    ).data;
    expect((await u.session.http.get(`/accounts/${acc._id}`)).data.balance).toBe(700);

    await u.session.http.patch(`/credits/${c._id}`, { reflected: false });
    expect((await u.session.http.get(`/accounts/${acc._id}`)).data.balance).toBe(1000);
  });
});

describe("Credits — per-person summary", () => {
  it("nets 'given' against 'received' per person", async () => {
    const u = await createVerifiedUser();
    await u.session.http.post("/credits", { person: "Eve", direction: "given", amount: 500 });
    await u.session.http.post("/credits", { person: "Eve", direction: "received", amount: 200 });

    const summary = (await u.session.http.get("/credits/summary")).data;
    const eve = summary.find((s: any) => s.person === "Eve");
    expect(eve).toMatchObject({ given: 500, received: 200, net: 300 });
  });
});

describe("Credits — validation & ownership", () => {
  it("rejects a blank person (400)", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/credits", { person: "", direction: "given", amount: 100 })).status).toBe(400);
  });

  it("rejects a non-positive amount (400)", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/credits", { person: "X", direction: "given", amount: 0 })).status).toBe(400);
  });

  it("rejects an invalid direction (400)", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/credits", { person: "X", direction: "sideways", amount: 10 })).status).toBe(400);
  });

  it("404s for another user's credit", async () => {
    const owner = await createVerifiedUser();
    const c = (await owner.session.http.post("/credits", { person: "Mine", direction: "given", amount: 100 })).data;
    const stranger = await createVerifiedUser();
    expect((await stranger.session.http.patch(`/credits/${c._id}`, { amount: 5 })).status).toBe(404);
    expect((await stranger.session.http.delete(`/credits/${c._id}`)).status).toBe(404);
  });
});
