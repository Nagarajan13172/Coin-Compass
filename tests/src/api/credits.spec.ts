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
  it("a reflected 'given' credit creates a linked TRANSFER (not an expense) and moves the balance", async () => {
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
    // The linked movement is a TRANSFER to "Money Lent", never an expense.
    const txn = (await u.session.http.get(`/transactions/${res.data.transaction}`)).data;
    expect(txn.type).toBe("transfer");
    expect((await u.session.http.get(`/accounts/${acc._id}`)).data.balance).toBe(700);
  });

  it("rejects reflecting without an account (400)", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.post("/credits", { person: "X", direction: "given", amount: 100, reflected: true });
    expect(res.status).toBe(400);
  });

  it("deleting a reflected credit's transaction also removes the credit entry", async () => {
    const u = await createVerifiedUser();
    const acc = await newAccount(u, { initialBalance: 1000 });
    const c = (
      await u.session.http.post("/credits", { person: "Zoe", direction: "given", amount: 200, account: acc._id, reflected: true })
    ).data;
    expect(c.transaction).toBeTruthy();

    // Deleting the linked transaction from the Transactions area...
    expect((await u.session.http.delete(`/transactions/${c.transaction}`)).status).toBe(200);

    // ...also removes the credit itself (no lingering entry) and restores the balance.
    const credits = (await u.session.http.get("/credits")).data;
    expect(credits.some((x: any) => x._id === c._id)).toBe(false);
    expect((await u.session.http.get(`/accounts/${acc._id}`)).data.balance).toBe(1000);
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

/**
 * The neutralizing model, end to end: lending/repaying move balances via
 * TRANSFERS (real account ↔ auto-managed "Money Lent"), so they top up your
 * account without ever inflating income/expense. Only money received BEYOND what
 * a person owed becomes income.
 */
const INITIAL = 50_000;

async function bank(u: TestUser, initialBalance = INITIAL) {
  const res = await u.session.http.post("/accounts", { name: "Bank", type: "bank", initialBalance });
  expect(res.status).toBe(201);
  return res.data;
}
/** GET /accounts keyed by name → { balance, includeInTotal, stats, … }. */
async function accounts(u: TestUser): Promise<Record<string, any>> {
  const res = await u.session.http.get("/accounts");
  const map: Record<string, any> = {};
  for (const a of res.data) map[a.name] = a;
  return map;
}
const summary = async (u: TestUser) => (await u.session.http.get("/transactions/summary")).data;
const txnItems = async (u: TestUser) => (await u.session.http.get("/transactions")).data.items;
const lend = (u: TestUser, person: string, amount: number, account: string) =>
  u.session.http.post("/credits", { person, direction: "given", amount, account, reflected: true });
const repay = (u: TestUser, person: string, amount: number, account: string) =>
  u.session.http.post("/credits", { person, direction: "received", amount, account, reflected: true });

describe("Credits — neutralize via transfers (no income inflation)", () => {
  it("lending is a TRANSFER, not an expense: bank drops, Money Lent rises, income/expense untouched", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    expect((await lend(u, "Ravi", 20_000, b._id)).status).toBe(201);

    const acc = await accounts(u);
    expect(acc["Bank"].balance).toBe(INITIAL - 20_000); // 30,000
    expect(acc["Money Lent"]?.balance).toBe(20_000); // receivable asset
    const s = await summary(u);
    expect(s.income).toBe(0);
    expect(s.expense).toBe(0); // ← lending is NOT an expense
    expect((await txnItems(u)).every((t: any) => t.type === "transfer")).toBe(true);
  });

  it("a repayment tops up the account WITHOUT being income (neutralized)", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await lend(u, "Ravi", 20_000, b._id);
    await repay(u, "Ravi", 15_000, b._id);

    const acc = await accounts(u);
    expect(acc["Bank"].balance).toBe(INITIAL - 20_000 + 15_000); // 45,000
    expect(acc["Money Lent"].balance).toBe(5_000); // still owed
    expect((await summary(u)).income).toBe(0); // ← repayment is NOT income
  });

  it("full lend→repay cycle neutralizes: bank restored, Money Lent 0, income/expense 0", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await lend(u, "Ravi", 20_000, b._id);
    await repay(u, "Ravi", 20_000, b._id);

    const acc = await accounts(u);
    expect(acc["Bank"].balance).toBe(INITIAL);
    expect(acc["Money Lent"].balance).toBe(0);
    const s = await summary(u);
    expect(s.income).toBe(0);
    expect(s.expense).toBe(0);
  });

  it("partial repayments across entries draw down the balance, still no income (9k + 11k)", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await lend(u, "Kumar", 20_000, b._id);
    await repay(u, "Kumar", 9_000, b._id);
    let acc = await accounts(u);
    expect(acc["Money Lent"].balance).toBe(11_000);
    expect(acc["Bank"].balance).toBe(INITIAL - 20_000 + 9_000); // 39,000

    await repay(u, "Kumar", 11_000, b._id);
    acc = await accounts(u);
    expect(acc["Money Lent"].balance).toBe(0);
    expect(acc["Bank"].balance).toBe(INITIAL);
    expect((await summary(u)).income).toBe(0);
  });

  it("the last installment in a new month is still neutralized, not new income (15k + 5k)", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await lend(u, "Meera", 20_000, b._id);
    await repay(u, "Meera", 15_000, b._id);
    await repay(u, "Meera", 5_000, b._id); // the "remaining 5k next month"
    expect((await summary(u)).income).toBe(0); // ← the correction we discussed
    expect((await accounts(u))["Bank"].balance).toBe(INITIAL);
  });

  it("overpayment: dues neutralize and ONLY the excess is income (owed 20k, pay 22k)", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await lend(u, "Arjun", 20_000, b._id);
    await repay(u, "Arjun", 22_000, b._id);

    const s = await summary(u);
    expect(s.income).toBe(2_000); // only the ₹2,000 extra
    expect(s.expense).toBe(0);
    const acc = await accounts(u);
    expect(acc["Money Lent"].balance).toBe(0);
    expect(acc["Bank"].balance).toBe(INITIAL - 20_000 + 22_000); // 52,000
  });

  it("net worth stays flat after lending (bank drop offset by Money Lent)", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    const nw = (m: Record<string, any>) =>
      Object.values(m).reduce((sum: number, a: any) => sum + (a.includeInTotal ? a.balance : 0), 0);
    const before = nw(await accounts(u));
    await lend(u, "Ravi", 12_000, b._id);
    expect(nw(await accounts(u))).toBe(before); // lending didn't make you poorer
  });

  it("credit summary tracks the running outstanding per person", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await lend(u, "Ravi", 20_000, b._id);
    await repay(u, "Ravi", 9_000, b._id);
    const rows = (await u.session.http.get("/credits/summary")).data;
    expect(rows.find((r: any) => r.person === "Ravi")).toMatchObject({ given: 20_000, received: 9_000, net: 11_000 });
  });

  it("a non-reflected credit records the IOU but never touches the ledger", async () => {
    const u = await createVerifiedUser();
    await bank(u);
    await u.session.http.post("/credits", { person: "Sam", direction: "given", amount: 5_000, reflected: false });
    const acc = await accounts(u);
    expect(acc["Bank"].balance).toBe(INITIAL); // untouched
    expect(acc["Money Lent"]).toBeUndefined(); // not even created
    expect((await txnItems(u)).length).toBe(0);
  });
});
