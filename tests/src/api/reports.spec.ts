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
