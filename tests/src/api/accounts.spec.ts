import { describe, it, expect } from "vitest";
import { createVerifiedUser, type TestUser } from "../harness/users";
import { newSession } from "../harness/http";

const list = async (u: TestUser, query = "") =>
  (await u.session.http.get(`/accounts${query}`)).data as any[];

describe("Accounts — CRUD", () => {
  it("a new user starts with a default Cash account carrying a computed balance", async () => {
    const u = await createVerifiedUser();
    const accounts = await list(u);
    expect(Array.isArray(accounts)).toBe(true);
    expect(accounts.some((a) => a.name === "Cash")).toBe(true);
    expect(accounts[0]).toHaveProperty("balance");
  });

  it("creates an account (201) with schema defaults applied", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.post("/accounts", { name: "HDFC Savings", type: "bank" });
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ name: "HDFC Savings", type: "bank", currency: "INR", initialBalance: 0 });
    expect(res.data._id).toBeTruthy();
  });

  it("fetches one account with its balance = initialBalance when it has no transactions", async () => {
    const u = await createVerifiedUser();
    const created = (await u.session.http.post("/accounts", { name: "Wallet", initialBalance: 500 })).data;
    const res = await u.session.http.get(`/accounts/${created._id}`);
    expect(res.status).toBe(200);
    expect(res.data.balance).toBe(500);
  });

  it("updates an account", async () => {
    const u = await createVerifiedUser();
    const created = (await u.session.http.post("/accounts", { name: "Old" })).data;
    const res = await u.session.http.patch(`/accounts/${created._id}`, { name: "New", color: "#123456" });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ name: "New", color: "#123456" });
  });

  it("deletes an account with no transactions", async () => {
    const u = await createVerifiedUser();
    const created = (await u.session.http.post("/accounts", { name: "Temp" })).data;
    expect((await u.session.http.delete(`/accounts/${created._id}`)).status).toBe(200);
    expect((await u.session.http.get(`/accounts/${created._id}`)).status).toBe(404);
  });
});

describe("Accounts — validation & rules", () => {
  it("rejects a blank name with 400", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/accounts", { name: "" })).status).toBe(400);
  });

  it("rejects an invalid account type with 400", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/accounts", { name: "X", type: "crypto" })).status).toBe(400);
  });

  it("hides archived accounts unless includeArchived=true", async () => {
    const u = await createVerifiedUser();
    const a = (await u.session.http.post("/accounts", { name: "Hidden", archived: true })).data;
    const visible = (await list(u)).map((x) => x._id);
    expect(visible).not.toContain(a._id);
    const all = (await list(u, "?includeArchived=true")).map((x) => x._id);
    expect(all).toContain(a._id);
  });

  it("refuses to delete an account with transactions unless forced", async () => {
    const u = await createVerifiedUser();
    const acc = (await u.session.http.post("/accounts", { name: "Spendy" })).data;
    await u.session.http.post("/transactions", { type: "expense", amount: 10, account: acc._id });

    expect((await u.session.http.delete(`/accounts/${acc._id}`)).status).toBe(409);
    expect((await u.session.http.delete(`/accounts/${acc._id}?force=true`)).status).toBe(200);
    expect((await u.session.http.get(`/accounts/${acc._id}`)).status).toBe(404);
  });

  it("404s for another user's account (ownership isolation)", async () => {
    const owner = await createVerifiedUser();
    const acc = (await owner.session.http.post("/accounts", { name: "Private" })).data;
    const stranger = await createVerifiedUser();
    expect((await stranger.session.http.get(`/accounts/${acc._id}`)).status).toBe(404);
    expect((await stranger.session.http.patch(`/accounts/${acc._id}`, { name: "hax" })).status).toBe(404);
    expect((await stranger.session.http.delete(`/accounts/${acc._id}`)).status).toBe(404);
  });

  it("requires authentication", async () => {
    expect((await newSession().http.get("/accounts")).status).toBe(401);
  });
});
