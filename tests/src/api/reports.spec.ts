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
