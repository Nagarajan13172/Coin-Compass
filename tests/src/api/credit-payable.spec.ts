import { describe, it, expect } from "vitest";
import { createVerifiedUser, type TestUser } from "../harness/users";

/**
 * The other half of an informal debt: money YOU owe.
 *
 * Before this existed, a friend buying your dinner had to be recorded as a
 * "received" credit — which booked ₹500 of phantom INCOME and never recorded the
 * food expense at all. These specs pin the mirror: borrowing never makes you
 * richer, paying someone back is never spending, and the meal is an expense at
 * the moment you eat it.
 */

const INITIAL = 50_000;

async function bank(u: TestUser) {
  const res = await u.session.http.post("/accounts", { name: "Bank", type: "bank", initialBalance: INITIAL });
  expect(res.status).toBe(201);
  return res.data;
}
async function foodCategory(u: TestUser) {
  const res = await u.session.http.post("/categories", { name: "Food", type: "expense" });
  expect(res.status).toBe(201);
  return res.data;
}
async function accounts(u: TestUser): Promise<Record<string, any>> {
  const map: Record<string, any> = {};
  for (const a of (await u.session.http.get("/accounts")).data) map[a.name] = a;
  return map;
}
const summary = async (u: TestUser) => (await u.session.http.get("/transactions/summary")).data;
const credits = async (u: TestUser) => (await u.session.http.get("/credits/summary")).data;
const netWorth = (m: Record<string, any>) =>
  Object.values(m).reduce((sum: number, a: any) => sum + (a.includeInTotal ? a.balance : 0), 0);

const borrowCash = (u: TestUser, amount: number, account: string) =>
  u.session.http.post("/credits", { person: "Ravi", direction: "borrowed", amount, account, reflected: true });
const repay = (u: TestUser, amount: number, account: string) =>
  u.session.http.post("/credits", { person: "Ravi", direction: "repaid", amount, account, reflected: true });

describe("Borrowing cash — you're not richer for it", () => {
  it("cash borrowed raises your bank AND what you owe", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    expect((await borrowCash(u, 5000, b._id)).status).toBe(201);

    const acc = await accounts(u);
    expect(acc["Bank"].balance).toBe(INITIAL + 5000);
    expect(acc["Money Owed"].balance).toBe(-5000); // a liability runs negative
  });

  it("borrowing is NOT income", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await borrowCash(u, 5000, b._id);
    const s = await summary(u);
    expect(s.income).toBe(0); // ← the bug this replaces booked 5,000 of income
    expect(s.expense).toBe(0);
  });

  it("net worth is unchanged by borrowing", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    const before = netWorth(await accounts(u));
    await borrowCash(u, 5000, b._id);
    expect(netWorth(await accounts(u))).toBe(before);
  });

  it("the person's balance shows that YOU owe them", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await borrowCash(u, 5000, b._id);
    expect((await credits(u)).find((r: any) => r.person === "Ravi")).toMatchObject({
      borrowed: 5000,
      net: -5000, // negative = you owe them
    });
  });
});

describe("Paying them back — clearing a debt is not spending", () => {
  it("a full repayment clears the debt without an expense", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await borrowCash(u, 5000, b._id);
    await repay(u, 5000, b._id);

    const acc = await accounts(u);
    expect(acc["Bank"].balance).toBe(INITIAL);
    expect(acc["Money Owed"].balance).toBe(0);
    const s = await summary(u);
    expect(s.expense).toBe(0); // ← repaying is a transfer, not spending
    expect(s.income).toBe(0);
  });

  it("a part repayment leaves the rest owed, still no expense", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await borrowCash(u, 5000, b._id);
    await repay(u, 2000, b._id);

    const acc = await accounts(u);
    expect(acc["Bank"].balance).toBe(INITIAL + 3000);
    expect(acc["Money Owed"].balance).toBe(-3000);
    expect((await summary(u)).expense).toBe(0);
  });

  it("paying MORE than you owe makes only the excess an expense", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await borrowCash(u, 5000, b._id);
    await repay(u, 5500, b._id); // ₹500 extra as a thank-you

    const s = await summary(u);
    expect(s.expense).toBe(500); // only the gift
    expect(s.income).toBe(0);
    expect((await accounts(u))["Money Owed"].balance).toBe(0);
  });

  it("the borrow→repay cycle returns everything to where it started", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    const before = netWorth(await accounts(u));
    await borrowCash(u, 5000, b._id);
    await repay(u, 5000, b._id);

    expect(netWorth(await accounts(u))).toBe(before);
    expect((await credits(u)).find((r: any) => r.person === "Ravi").net).toBe(0);
  });
});

describe("A friend paid for something you consumed", () => {
  /** The headline case: Ravi buys your ₹500 dinner. */
  const theirTreat = (u: TestUser, amount: number, category: string) =>
    u.session.http.post("/credits", {
      person: "Ravi",
      direction: "borrowed",
      amount,
      category, // ← names it as something you CONSUMED, not cash handed over
      reflected: true,
    });

  it("records a real expense AND a debt, touching none of your accounts", async () => {
    const u = await createVerifiedUser();
    await bank(u);
    const food = await foodCategory(u);
    expect((await theirTreat(u, 500, food._id)).status).toBe(201);

    const s = await summary(u);
    expect(s.expense).toBe(500); // ← you ate it, so you spent it
    expect(s.income).toBe(0); // ← and it is NOT income (the old bug)

    const acc = await accounts(u);
    expect(acc["Bank"].balance).toBe(INITIAL); // your bank never moved
    expect(acc["Money Owed"].balance).toBe(-500);
  });

  it("the expense is categorised, so it reaches budgets and reports", async () => {
    const u = await createVerifiedUser();
    const food = await foodCategory(u);
    await theirTreat(u, 500, food._id);

    const items = (await u.session.http.get("/transactions")).data.items;
    const expense = items.find((t: any) => t.type === "expense");
    expect(expense.amount).toBe(500);
    expect(expense.category?.name).toBe("Food");
  });

  it("net worth drops by what you consumed — once, not twice", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    const food = await foodCategory(u);
    const before = netWorth(await accounts(u));

    await theirTreat(u, 500, food._id);
    expect(netWorth(await accounts(u))).toBe(before - 500);

    // Paying Ravi back moves cash but must NOT make you poorer a second time.
    await repay(u, 500, b._id);
    expect(netWorth(await accounts(u))).toBe(before - 500);
    expect((await summary(u)).expense).toBe(500); // still 500, never 1,000
  });

  it("doesn't need an account of yours to reflect", async () => {
    const u = await createVerifiedUser();
    const food = await foodCategory(u);
    // No `account` at all — nothing of yours moved.
    expect((await theirTreat(u, 500, food._id)).status).toBe(201);
  });
});

describe("Splits — someone else paid the bill", () => {
  const theirBill = (u: TestUser, body: Record<string, unknown> = {}) =>
    u.session.http.post("/splits", {
      description: "KFC",
      totalAmount: 3000,
      yourShare: 500,
      paidBy: "Ravi",
      ...body,
    });

  it("records only YOUR share as expense, and as a debt to the payer", async () => {
    const u = await createVerifiedUser();
    await bank(u);
    const food = await foodCategory(u);
    expect((await theirBill(u, { category: food._id })).status).toBe(201);

    const s = await summary(u);
    expect(s.expense).toBe(500); // not 3,000 — you only ate your share
    expect(s.income).toBe(0);

    const acc = await accounts(u);
    expect(acc["Bank"].balance).toBe(INITIAL); // Ravi paid, not you
    expect(acc["Money Owed"].balance).toBe(-500);
    expect(acc["Money Lent"]).toBeUndefined(); // nobody owes YOU anything here
  });

  it("nobody owes you — only you owe the payer", async () => {
    const u = await createVerifiedUser();
    const food = await foodCategory(u);
    await theirBill(u, { category: food._id });

    const rows = await credits(u);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ person: "Ravi", net: -500 });
  });

  it("needs no account and no participants", async () => {
    const u = await createVerifiedUser();
    const food = await foodCategory(u);
    // Neither `account` nor `participants` — you don't track what others owe Ravi.
    const res = await theirBill(u, { category: food._id });
    expect(res.status).toBe(201);
    expect(res.data.paidBy).toBe("Ravi");
  });

  it("rejects a share bigger than the bill (400)", async () => {
    const u = await createVerifiedUser();
    const food = await foodCategory(u);
    const res = await theirBill(u, { category: food._id, yourShare: 4000 });
    expect(res.status).toBe(400);
  });

  it("settling up with the payer clears the debt without double-counting", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    const food = await foodCategory(u);
    await theirBill(u, { category: food._id });

    await repay(u, 500, b._id);

    const acc = await accounts(u);
    expect(acc["Bank"].balance).toBe(INITIAL - 500);
    expect(acc["Money Owed"].balance).toBe(0);
    const s = await summary(u);
    expect(s.expense).toBe(500); // the meal, counted exactly once
    expect(s.income).toBe(0);
    expect((await credits(u))[0].net).toBe(0);
  });

  it("deleting the split reverses the expense and the debt", async () => {
    const u = await createVerifiedUser();
    const food = await foodCategory(u);
    const split = (await theirBill(u, { category: food._id })).data;

    expect((await u.session.http.delete(`/splits/${split._id}`)).status).toBe(200);

    expect((await summary(u)).expense).toBe(0);
    expect((await accounts(u))["Money Owed"].balance).toBe(0);
    expect((await u.session.http.get("/credits")).data).toHaveLength(0);
  });

  it("a bill YOU paid still behaves exactly as before", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    const food = await foodCategory(u);
    const res = await u.session.http.post("/splits", {
      description: "KFC",
      totalAmount: 3000,
      yourShare: 500,
      account: b._id,
      category: food._id,
      participants: [
        { person: "Meera", amount: 500 },
        { person: "Arjun", amount: 500 },
        { person: "Kumar", amount: 500 },
        { person: "Divya", amount: 500 },
        { person: "Hari", amount: 500 },
      ],
    });
    expect(res.status).toBe(201);

    const acc = await accounts(u);
    expect(acc["Bank"].balance).toBe(INITIAL - 3000);
    expect(acc["Money Lent"].balance).toBe(2500);
    expect(acc["Money Owed"]).toBeUndefined(); // the payable side stays out of it
    expect((await summary(u)).expense).toBe(500);
  });
});

/**
 * Settling a balance must use the direction that CLEARS it. Using `given` to
 * settle money you owe zeroes the person's net by accident while leaving BOTH
 * buckets holding a phantom balance — the ledger looks square and the accounts
 * don't.
 */
describe("Settling a balance clears the right bucket", () => {
  it("repaying what you owe empties Money Owed and never touches Money Lent", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await borrowCash(u, 5000, b._id);

    await repay(u, 5000, b._id); // the direction "Settle up" prefills when net < 0

    const acc = await accounts(u);
    expect(acc["Money Owed"].balance).toBe(0);
    expect(acc["Money Lent"]).toBeUndefined(); // no phantom receivable invented
    expect(acc["Bank"].balance).toBe(INITIAL);
    expect((await credits(u)).find((r: any) => r.person === "Ravi").net).toBe(0);
  });

  it("using the WRONG direction is what a phantom balance looks like", async () => {
    // Pinning the failure mode so the fix can't silently regress: lending them
    // 5,000 to "settle" a 5,000 debt nets to zero but leaves both sides holding it.
    const u = await createVerifiedUser();
    const b = await bank(u);
    await borrowCash(u, 5000, b._id);
    await u.session.http.post("/credits", {
      person: "Ravi",
      direction: "given",
      amount: 5000,
      account: b._id,
      reflected: true,
    });

    const acc = await accounts(u);
    expect((await credits(u)).find((r: any) => r.person === "Ravi").net).toBe(0); // looks square…
    expect(acc["Money Lent"].balance).toBe(5000); // …but isn't
    expect(acc["Money Owed"].balance).toBe(-5000);
  });
});

describe("Both sides with the same person", () => {
  it("a lend and an equal borrow settle out to zero", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await u.session.http.post("/credits", {
      person: "Ravi",
      direction: "given",
      amount: 1000,
      account: b._id,
      reflected: true,
    });
    await borrowCash(u, 1000, b._id);

    const row = (await credits(u)).find((r: any) => r.person === "Ravi");
    expect(row.net).toBe(0); // one person, one balance

    // The two buckets stay honest rather than cancelling inside one account.
    const acc = await accounts(u);
    expect(acc["Money Lent"].balance).toBe(1000);
    expect(acc["Money Owed"].balance).toBe(-1000);
    expect(acc["Bank"].balance).toBe(INITIAL);
  });

  it("repaying a borrow never draws down what they owe YOU", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await u.session.http.post("/credits", {
      person: "Ravi",
      direction: "given",
      amount: 1000,
      account: b._id,
      reflected: true,
    });
    await repay(u, 400, b._id); // you owe him nothing — this is a gift

    const acc = await accounts(u);
    expect(acc["Money Lent"].balance).toBe(1000); // untouched by the other side
    expect(acc["Money Owed"].balance).toBe(0); // never driven positive
    expect((await summary(u)).expense).toBe(400); // a gift is real spending
  });
});
