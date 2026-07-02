import { describe, it, expect } from "vitest";
import { createVerifiedUser, type TestUser } from "../harness/users";

const csvHeaders = { headers: { "Content-Type": "text/csv" } };

async function seedTwoTxns(u: TestUser) {
  const acc = (await u.session.http.post("/accounts", { name: "Wallet" })).data;
  await u.session.http.post("/transactions", { type: "expense", amount: 100, account: acc._id, note: "Lunch" });
  await u.session.http.post("/transactions", { type: "income", amount: 200, account: acc._id });
}

describe("Export — CSV", () => {
  it("exports the user's transactions as CSV", async () => {
    const u = await createVerifiedUser();
    await seedTwoTxns(u);

    const res = await u.session.http.get("/export/csv");
    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"])).toMatch(/text\/csv/);

    const lines = String(res.data).trim().split("\n");
    expect(lines[0]).toMatch(/^Date,Type,Amount/);
    expect(lines.length).toBe(3); // header + 2 rows
    expect(res.data).toContain("100");
    expect(res.data).toContain("200");
  });
});

describe("Import — CSV", () => {
  it("imports transactions, creating missing accounts", async () => {
    const u = await createVerifiedUser();
    const csv = [
      "Date,Type,Amount,Account,Category,Note",
      "2026-01-15,expense,100,Wallet,Food,Lunch",
      "2026-01-16,income,200,Wallet,Salary,Payday",
    ].join("\n");

    const res = await u.session.http.post("/import", csv, csvHeaders);
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ total: 2, imported: 2 });
    expect(res.data.createdAccounts).toContain("Wallet");
    expect((await u.session.http.get("/transactions")).data.total).toBe(2);
  });

  it("reports invalid rows without failing the whole import", async () => {
    const u = await createVerifiedUser();
    const csv = ["Date,Type,Amount,Account", "2026-01-15,expense,100,Wallet", "not-a-date,expense,50,Wallet"].join("\n");
    const res = await u.session.http.post("/import", csv, csvHeaders);
    expect(res.status).toBe(200);
    expect(res.data.imported).toBe(1);
    expect(res.data.failed.length).toBe(1);
  });

  it("rejects a file missing required columns (400)", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.post("/import", "Date,Amount\n2026-01-15,100", csvHeaders);
    expect(res.status).toBe(400);
  });

  it("rejects an empty body (400)", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.post("/import", "", csvHeaders);
    expect(res.status).toBe(400);
  });
});

describe("Export → Import round-trip", () => {
  it("transactions exported by one user import cleanly into another", async () => {
    const a = await createVerifiedUser();
    await seedTwoTxns(a);
    const csv = String((await a.session.http.get("/export/csv")).data);

    const b = await createVerifiedUser();
    const res = await b.session.http.post("/import", csv, csvHeaders);
    expect(res.status).toBe(200);
    expect(res.data.imported).toBe(2);
    expect((await b.session.http.get("/transactions")).data.total).toBe(2);
  });
});
