import { describe, it, expect } from "vitest";
import { createVerifiedUser, type TestUser } from "../harness/users";

const list = async (u: TestUser, type?: string) =>
  (await u.session.http.get(`/categories${type ? `?type=${type}` : ""}`)).data as any[];

describe("Categories — CRUD", () => {
  it("a new user is seeded with default income & expense categories", async () => {
    const u = await createVerifiedUser();
    const all = await list(u);
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((c) => c.type === "income")).toBe(true);
    expect(all.some((c) => c.type === "expense")).toBe(true);
  });

  it("creates a category (201)", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.post("/categories", { name: "Coffee", type: "expense" });
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ name: "Coffee", type: "expense" });
  });

  it("filters by type", async () => {
    const u = await createVerifiedUser();
    const income = await list(u, "income");
    expect(income.length).toBeGreaterThan(0);
    expect(income.every((c) => c.type === "income")).toBe(true);
  });

  it("updates a category", async () => {
    const u = await createVerifiedUser();
    const c = (await u.session.http.post("/categories", { name: "Old", type: "expense" })).data;
    const res = await u.session.http.patch(`/categories/${c._id}`, { name: "New", color: "#ff0000" });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ name: "New", color: "#ff0000" });
  });

  it("deletes an unused category", async () => {
    const u = await createVerifiedUser();
    const c = (await u.session.http.post("/categories", { name: "Temp", type: "expense" })).data;
    expect((await u.session.http.delete(`/categories/${c._id}`)).status).toBe(200);
  });
});

describe("Categories — validation & rules", () => {
  it("rejects a missing or invalid type with 400", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/categories", { name: "NoType" })).status).toBe(400);
    expect((await u.session.http.post("/categories", { name: "Bad", type: "savings" })).status).toBe(400);
  });

  it("rejects a blank name with 400", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/categories", { name: "", type: "income" })).status).toBe(400);
  });

  it("refuses to delete a category in use unless forced, then clears it on the transactions", async () => {
    const u = await createVerifiedUser();
    const acc = (await u.session.http.post("/accounts", { name: "A" })).data;
    const cat = (await u.session.http.post("/categories", { name: "Dining", type: "expense" })).data;
    const t = (
      await u.session.http.post("/transactions", { type: "expense", amount: 10, account: acc._id, category: cat._id })
    ).data;

    expect((await u.session.http.delete(`/categories/${cat._id}`)).status).toBe(409);
    expect((await u.session.http.delete(`/categories/${cat._id}?force=true`)).status).toBe(200);

    const after = (await u.session.http.get(`/transactions/${t._id}`)).data;
    expect(after.category).toBeNull();
  });

  it("404s for another user's category (ownership isolation)", async () => {
    const owner = await createVerifiedUser();
    const c = (await owner.session.http.post("/categories", { name: "Mine", type: "income" })).data;
    const stranger = await createVerifiedUser();
    expect((await stranger.session.http.patch(`/categories/${c._id}`, { name: "x" })).status).toBe(404);
    expect((await stranger.session.http.delete(`/categories/${c._id}`)).status).toBe(404);
  });
});
