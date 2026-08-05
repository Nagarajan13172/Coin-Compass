import { describe, it, expect } from "vitest";
import { createVerifiedUser, type TestUser } from "../harness/users";

/**
 * Splitting a shared bill. The point of the feature is NOT bookkeeping about
 * friends — it's that a ₹3,000 group dinner must not read as ₹3,000 of your own
 * food spending. Only your own share is an expense; everyone else's is a
 * receivable (a TRANSFER into the auto-managed "Money Lent" account), and their
 * repayment later is a transfer BACK, never income.
 *
 * These specs assert that model end to end, against real balances.
 */

const INITIAL = 50_000;

async function bank(u: TestUser, initialBalance = INITIAL) {
  const res = await u.session.http.post("/accounts", { name: "Bank", type: "bank", initialBalance });
  expect(res.status).toBe(201);
  return res.data;
}

async function foodCategory(u: TestUser) {
  const res = await u.session.http.post("/categories", { name: "Food", type: "expense" });
  expect(res.status).toBe(201);
  return res.data;
}

/** GET /accounts keyed by name → { balance, includeInTotal, … }. */
async function accounts(u: TestUser): Promise<Record<string, any>> {
  const map: Record<string, any> = {};
  for (const a of (await u.session.http.get("/accounts")).data) map[a.name] = a;
  return map;
}

const summary = async (u: TestUser) => (await u.session.http.get("/transactions/summary")).data;
const txnItems = async (u: TestUser) => (await u.session.http.get("/transactions")).data.items;
const netWorth = (m: Record<string, any>) =>
  Object.values(m).reduce((sum: number, a: any) => sum + (a.includeInTotal ? a.balance : 0), 0);

const repay = (u: TestUser, person: string, amount: number, account: string) =>
  u.session.http.post("/credits", { person, direction: "received", amount, account, reflected: true });

/** The KFC case from the feature request: ₹3,000, six people, equal shares. */
async function kfc(u: TestUser, accountId: string, categoryId?: string) {
  return u.session.http.post("/splits", {
    description: "KFC",
    totalAmount: 3000,
    yourShare: 500,
    account: accountId,
    category: categoryId ?? null,
    participants: [
      { person: "Ravi", amount: 500 },
      { person: "Meera", amount: 500 },
      { person: "Arjun", amount: 500 },
      { person: "Kumar", amount: 500 },
      { person: "Divya", amount: 500 },
    ],
  });
}

describe("Splits — the core promise: only YOUR share is spending", () => {
  it("a ₹3,000 bill split 6 ways records ₹500 of expense, not ₹3,000", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    const food = await foodCategory(u);
    expect((await kfc(u, b._id, food._id)).status).toBe(201);

    const s = await summary(u);
    expect(s.expense).toBe(500); // ← the whole point
    expect(s.income).toBe(0); // lending is never income
  });

  it("the full bill still leaves the paying account", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await kfc(u, b._id);
    expect((await accounts(u))["Bank"].balance).toBe(INITIAL - 3000);
  });

  it("everyone else's share lands in the Money Lent receivable", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await kfc(u, b._id);
    expect((await accounts(u))["Money Lent"].balance).toBe(2500);
  });

  it("net worth drops by your share ONLY — you are not ₹3,000 poorer", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    const before = netWorth(await accounts(u));
    await kfc(u, b._id);
    expect(netWorth(await accounts(u))).toBe(before - 500);
  });

  it("your share is categorised; the others' shares are transfers with no category", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    const food = await foodCategory(u);
    await kfc(u, b._id, food._id);

    const items = await txnItems(u);
    const expenses = items.filter((t: any) => t.type === "expense");
    const transfers = items.filter((t: any) => t.type === "transfer");
    expect(expenses).toHaveLength(1);
    expect(expenses[0].amount).toBe(500);
    expect(expenses[0].category?.name).toBe("Food");
    expect(transfers).toHaveLength(5); // one per participant
    expect(transfers.every((t: any) => t.category === null)).toBe(true);
  });

  it("the ledger legs add back up to the bill exactly", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await kfc(u, b._id);
    const items = await txnItems(u);
    const outflow = items.reduce((sum: number, t: any) => sum + t.amount, 0);
    expect(outflow).toBe(3000);
  });
});

describe("Splits — participants become credits", () => {
  it("creates one credit per person, each owing their share", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await kfc(u, b._id);

    const rows = (await u.session.http.get("/credits/summary")).data;
    for (const person of ["Ravi", "Meera", "Arjun", "Kumar", "Divya"]) {
      expect(rows.find((r: any) => r.person === person)).toMatchObject({ given: 500, net: 500 });
    }
  });

  it("reports each participant's outstanding on the split itself", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    const split = (await kfc(u, b._id)).data;
    expect(split.participants).toHaveLength(5);
    expect(split.participants.every((p: any) => p.amount === 500 && p.outstanding === 500)).toBe(true);
  });

  it("a zero-amount participant is recorded on the bill but owes nothing", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    const res = await u.session.http.post("/splits", {
      description: "Dinner",
      totalAmount: 1000,
      yourShare: 500,
      account: b._id,
      participants: [
        { person: "Paid Already", amount: 0 },
        { person: "Owes", amount: 500 },
      ],
    });
    expect(res.status).toBe(201);
    const rows = (await u.session.http.get("/credits/summary")).data;
    expect(rows.find((r: any) => r.person === "Paid Already")).toBeUndefined();
    expect(rows.find((r: any) => r.person === "Owes")).toMatchObject({ net: 500 });
  });
});

describe("Splits — settling up is NOT income", () => {
  it("one person repaying tops up the bank without creating income", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await kfc(u, b._id);
    await repay(u, "Ravi", 500, b._id);

    const acc = await accounts(u);
    expect(acc["Bank"].balance).toBe(INITIAL - 3000 + 500);
    expect(acc["Money Lent"].balance).toBe(2000);
    const s = await summary(u);
    expect(s.income).toBe(0); // ← settling up is a transfer back, never income
    expect(s.expense).toBe(500); // your share, unchanged by their repayment
  });

  it("everyone repaying leaves you exactly your own share out of pocket", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await kfc(u, b._id);
    for (const p of ["Ravi", "Meera", "Arjun", "Kumar", "Divya"]) await repay(u, p, 500, b._id);

    const acc = await accounts(u);
    expect(acc["Bank"].balance).toBe(INITIAL - 500); // only the KFC you ate
    expect(acc["Money Lent"].balance).toBe(0); // nobody owes you anything
    const s = await summary(u);
    expect(s.income).toBe(0);
    expect(s.expense).toBe(500);
  });

  it("a part repayment leaves the rest outstanding", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    const split = (await kfc(u, b._id)).data;
    await repay(u, "Ravi", 200, b._id);

    const refreshed = (await u.session.http.get(`/splits/${split._id}`)).data;
    const ravi = refreshed.participants.find((p: any) => p.person === "Ravi");
    expect(ravi).toMatchObject({ amount: 500, outstanding: 300 });
    expect((await summary(u)).income).toBe(0);
  });

  it("someone paying MORE than their share makes only the excess income", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await kfc(u, b._id);
    await repay(u, "Ravi", 600, b._id); // ₹100 tip on top of his ₹500

    const s = await summary(u);
    expect(s.income).toBe(100); // only the extra
    expect(s.expense).toBe(500);
  });
});

describe("Splits — conservation is enforced", () => {
  const badSplit = (u: TestUser, accountId: string, body: Record<string, unknown>) =>
    u.session.http.post("/splits", {
      description: "Bad",
      account: accountId,
      ...body,
    });

  it("rejects shares that add up to less than the bill (400)", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    const res = await badSplit(u, b._id, {
      totalAmount: 3000,
      yourShare: 500,
      participants: [{ person: "A", amount: 500 }],
    });
    expect(res.status).toBe(400);
  });

  it("rejects shares that add up to more than the bill (400)", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    const res = await badSplit(u, b._id, {
      totalAmount: 1000,
      yourShare: 500,
      participants: [{ person: "A", amount: 800 }],
    });
    expect(res.status).toBe(400);
  });

  it("rejects a split with no participants (400)", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    expect((await badSplit(u, b._id, { totalAmount: 1000, yourShare: 1000, participants: [] })).status).toBe(400);
  });

  it("rejects a negative share (400)", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    const res = await badSplit(u, b._id, {
      totalAmount: 1000,
      yourShare: 1200,
      participants: [{ person: "A", amount: -200 }],
    });
    expect(res.status).toBe(400);
  });

  it("a rejected split posts nothing at all — no half-written ledger", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await badSplit(u, b._id, {
      totalAmount: 3000,
      yourShare: 500,
      participants: [{ person: "Ghost", amount: 100 }],
    });
    expect((await txnItems(u)).length).toBe(0);
    expect((await u.session.http.get("/credits")).data.length).toBe(0);
    expect((await accounts(u))["Bank"].balance).toBe(INITIAL);
  });

  it("accepts a bill that doesn't divide evenly, to the paisa", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    // 1000 across 3: 333.34 / 333.33 / 333.33
    const res = await u.session.http.post("/splits", {
      description: "Chai",
      totalAmount: 1000,
      yourShare: 333.34,
      account: b._id,
      participants: [
        { person: "A", amount: 333.33 },
        { person: "B", amount: 333.33 },
      ],
    });
    expect(res.status).toBe(201);
    expect((await accounts(u))["Bank"].balance).toBeCloseTo(INITIAL - 1000, 2);
  });
});

describe("Splits — you paid entirely for others", () => {
  it("a zero share for yourself posts no expense at all", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    const res = await u.session.http.post("/splits", {
      description: "Their cab",
      totalAmount: 600,
      yourShare: 0,
      account: b._id,
      participants: [
        { person: "P", amount: 300 },
        { person: "Q", amount: 300 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.data.expenseTransaction).toBeNull();

    const s = await summary(u);
    expect(s.expense).toBe(0); // you consumed nothing
    expect(s.income).toBe(0);
    const acc = await accounts(u);
    expect(acc["Bank"].balance).toBe(INITIAL - 600);
    expect(acc["Money Lent"].balance).toBe(600);
  });
});

describe("Splits — update and delete", () => {
  it("updating rebuilds every leg and leaves no stale balance", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    const split = (await kfc(u, b._id)).data;

    // Same bill, re-split 3 ways instead of 6.
    const res = await u.session.http.patch(`/splits/${split._id}`, {
      description: "KFC",
      totalAmount: 3000,
      yourShare: 1000,
      account: b._id,
      participants: [
        { person: "Ravi", amount: 1000 },
        { person: "Meera", amount: 1000 },
      ],
    });
    expect(res.status).toBe(200);

    const acc = await accounts(u);
    expect(acc["Bank"].balance).toBe(INITIAL - 3000); // the bill is unchanged
    expect(acc["Money Lent"].balance).toBe(2000); // 2 × 1,000, not 5 × 500
    expect((await summary(u)).expense).toBe(1000);

    const rows = (await u.session.http.get("/credits/summary")).data;
    expect(rows.find((r: any) => r.person === "Arjun")).toBeUndefined(); // dropped cleanly
    expect(rows.find((r: any) => r.person === "Ravi")).toMatchObject({ net: 1000 });
  });

  it("a rejected update leaves the original split untouched", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    const split = (await kfc(u, b._id)).data;

    const res = await u.session.http.patch(`/splits/${split._id}`, {
      description: "KFC",
      totalAmount: 3000,
      yourShare: 100,
      account: b._id,
      participants: [{ person: "Ravi", amount: 100 }], // nowhere near 3,000
    });
    expect(res.status).toBe(400);

    const acc = await accounts(u);
    expect(acc["Bank"].balance).toBe(INITIAL - 3000);
    expect(acc["Money Lent"].balance).toBe(2500); // original legs still intact
    expect((await summary(u)).expense).toBe(500);
  });

  it("deleting a split reverses every leg and restores the balances", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    const split = (await kfc(u, b._id)).data;

    expect((await u.session.http.delete(`/splits/${split._id}`)).status).toBe(200);

    const acc = await accounts(u);
    expect(acc["Bank"].balance).toBe(INITIAL);
    expect(acc["Money Lent"].balance).toBe(0);
    const s = await summary(u);
    expect(s.expense).toBe(0);
    expect(s.income).toBe(0);
    expect((await u.session.http.get("/credits")).data.length).toBe(0);
    expect((await txnItems(u)).length).toBe(0);
  });

  it("deleting one leg from the ledger dissolves the grouping without losing money", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    const split = (await kfc(u, b._id)).data;
    const expenseLeg = (await txnItems(u)).find((t: any) => t.type === "expense");

    expect((await u.session.http.delete(`/transactions/${expenseLeg._id}`)).status).toBe(200);

    // The split header is gone (its shares no longer add up)…
    expect((await u.session.http.get(`/splits/${split._id}`)).status).toBe(404);
    // …but every IOU survives as an ordinary credit, and no money vanished.
    const acc = await accounts(u);
    expect(acc["Money Lent"].balance).toBe(2500);
    expect(acc["Bank"].balance).toBe(INITIAL - 2500);
    expect((await u.session.http.get("/credits")).data.length).toBe(5);
  });
});

describe("Splits — listing, validation & ownership", () => {
  it("lists splits newest first with their participants", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    await kfc(u, b._id);
    const list = (await u.session.http.get("/splits")).data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ description: "KFC", totalAmount: 3000, yourShare: 500 });
    expect(list[0].participants).toHaveLength(5);
  });

  it("rejects a blank description (400)", async () => {
    const u = await createVerifiedUser();
    const b = await bank(u);
    const res = await u.session.http.post("/splits", {
      description: "",
      totalAmount: 100,
      yourShare: 50,
      account: b._id,
      participants: [{ person: "A", amount: 50 }],
    });
    expect(res.status).toBe(400);
  });

  it("rejects a missing account (400)", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.post("/splits", {
      description: "No account",
      totalAmount: 100,
      yourShare: 50,
      participants: [{ person: "A", amount: 50 }],
    });
    expect(res.status).toBe(400);
  });

  it("404s for another user's split", async () => {
    const owner = await createVerifiedUser();
    const b = await bank(owner);
    const split = (await kfc(owner, b._id)).data;

    const stranger = await createVerifiedUser();
    expect((await stranger.session.http.get(`/splits/${split._id}`)).status).toBe(404);
    expect((await stranger.session.http.delete(`/splits/${split._id}`)).status).toBe(404);
  });

  it("another user's splits never appear in your list", async () => {
    const owner = await createVerifiedUser();
    const b = await bank(owner);
    await kfc(owner, b._id);
    const stranger = await createVerifiedUser();
    expect((await stranger.session.http.get("/splits")).data).toHaveLength(0);
  });
});
