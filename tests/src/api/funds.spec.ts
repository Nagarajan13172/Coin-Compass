import { describe, it, expect } from "vitest";
import { createVerifiedUser, type TestUser } from "../harness/users";

/**
 * Mutual funds. The stub NAV provider publishes two schemes at fixed NAVs —
 * Parag Parikh Flexi Cap (122639) at ₹100 and HDFC Liquid (119063) at ₹50 — so
 * every figure below is exact arithmetic rather than whatever the market did.
 *
 * The design being protected: a purchase moves real cash into the Securities
 * bucket, units are held per lot so a redemption can go FIFO, and nothing about
 * a holding can be edited from the Transactions page behind the portfolio's back.
 */
const PPFAS = "122639";
const NAV = 100;

/** A user with a bank account to buy from. */
async function investor(balance = 100000): Promise<{ u: TestUser; bank: string }> {
  const u = await createVerifiedUser();
  const bank = (await u.session.http.post("/accounts", { name: "HDFC Savings", initialBalance: balance })).data;
  return { u, bank: bank._id };
}

const buy = (u: TestUser, body: Record<string, unknown>) => u.session.http.post("/funds/buy", body);
const redeem = (u: TestUser, body: Record<string, unknown>) => u.session.http.post("/funds/redeem", body);
const portfolio = (u: TestUser) => u.session.http.get("/funds/portfolio");
const balanceOf = async (u: TestUser, id: string) =>
  ((await u.session.http.get("/accounts")).data as { _id: string; balance: number }[]).find((a) => a._id === id)!
    .balance;

describe("Funds — finding a scheme", () => {
  it("searches the cached AMFI universe", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.get("/funds/search?q=parag");
    expect(res.status).toBe(200);
    expect(res.data[0]).toMatchObject({
      schemeCode: PPFAS,
      name: "Parag Parikh Flexi Cap Fund",
      plan: "Direct",
      option: "Growth",
      kind: "equity",
    });
  });

  it("ignores a query too short to mean anything", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.get("/funds/search?q=p")).data).toEqual([]);
  });
});

describe("Funds — buying", () => {
  it("turns rupees into units at the published NAV", async () => {
    const { u, bank } = await investor();
    const res = await buy(u, { schemeCode: PPFAS, account: bank, amount: 5000 });
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ units: 50, unitsRemaining: 50, buyNav: NAV, schemeCode: PPFAS });
    // The money actually left the bank.
    expect(await balanceOf(u, bank)).toBe(95000);
  });

  it("accepts units straight off a statement instead", async () => {
    const { u, bank } = await investor();
    const res = await buy(u, { schemeCode: PPFAS, account: bank, units: 11.284, nav: 443.12 });
    expect(res.status).toBe(201);
    expect(res.data.units).toBe(11.284);
    // 11.284 × 443.12 = ₹5,000.17 to the paisa.
    expect(await balanceOf(u, bank)).toBe(94999.83);
  });

  it("records units bought before tracking started without inventing a payment", async () => {
    const { u, bank } = await investor();
    await buy(u, { schemeCode: PPFAS, account: bank, units: 100, recordCash: false });
    expect(await balanceOf(u, bank)).toBe(100000); // untouched
    expect((await portfolio(u)).data.positions[0].units).toBe(100);
  });

  it("refuses a scheme AMFI doesn't list, and a purchase with neither amount nor units", async () => {
    const { u, bank } = await investor();
    const unknown = await buy(u, { schemeCode: "000000", account: bank, amount: 1000 });
    expect(unknown.status).toBe(404);
    expect(unknown.data.code).toBe("FUND_NOT_FOUND");
    expect((await buy(u, { schemeCode: PPFAS, account: bank })).status).toBe(400);
  });

  it("refuses another user's account", async () => {
    const { u } = await investor();
    const other = await investor();
    const res = await buy(u, { schemeCode: PPFAS, account: other.bank, amount: 1000 });
    expect(res.status).toBe(404);
  });
});

describe("Funds — the portfolio", () => {
  it("values holdings at the latest NAV and shows the unrealised gain", async () => {
    const { u, bank } = await investor();
    // Bought at ₹80; the stub publishes ₹100, so 50 units are worth ₹5,000.
    await buy(u, { schemeCode: PPFAS, account: bank, units: 50, nav: 80 });
    const res = await portfolio(u);
    expect(res.status).toBe(200);
    expect(res.data.positions[0]).toMatchObject({
      schemeCode: PPFAS,
      units: 50,
      invested: 4000,
      nav: NAV,
      marketValue: 5000,
      unrealizedPL: 1000,
      unrealizedPct: 25,
    });
    expect(res.data).toMatchObject({ invested: 4000, marketValue: 5000, unrealizedPL: 1000 });
  });

  it("groups every purchase of one scheme into a single position, lots kept", async () => {
    const { u, bank } = await investor();
    await buy(u, { schemeCode: PPFAS, account: bank, units: 30, nav: 80 });
    await buy(u, { schemeCode: PPFAS, account: bank, units: 20, nav: 90 });
    const [position] = (await portfolio(u)).data.positions;
    expect(position.units).toBe(50);
    expect(position.invested).toBe(4200); // 30×80 + 20×90
    expect(position.avgNav).toBe(84);
    expect(position.lots).toHaveLength(2);
  });

  it("moves the cost into the Securities bucket, so nothing is counted twice", async () => {
    // The bucket holds the cost basis of every open lot; net worth then adds the
    // portfolio's MARKET value instead of that bucket (which is includeInTotal:
    // false). Buying is therefore value-neutral, exactly as it is for stocks.
    const { u, bank } = await investor();
    await buy(u, { schemeCode: PPFAS, account: bank, amount: 5000 });

    const accounts = (await u.session.http.get("/accounts")).data as {
      type: string;
      balance: number;
      includeInTotal: boolean;
    }[];
    const securities = accounts.find((a) => a.type === "securities")!;
    expect(await balanceOf(u, bank)).toBe(95000);
    expect(securities).toMatchObject({ balance: 5000, includeInTotal: false });
    expect((await portfolio(u)).data.marketValue).toBe(5000);
  });
});

describe("Funds — redeeming", () => {
  it("consumes the oldest units first and books the gain", async () => {
    const { u, bank } = await investor();
    await buy(u, { schemeCode: PPFAS, account: bank, units: 30, nav: 80 }); // oldest
    await buy(u, { schemeCode: PPFAS, account: bank, units: 20, nav: 90 });

    const res = await redeem(u, { schemeCode: PPFAS, account: bank, units: 40, nav: 120 });
    expect(res.status).toBe(201);
    // FIFO: all 30 of the ₹80 lot, then 10 of the ₹90 lot → cost ₹3,300.
    // Proceeds 40 × 120 = ₹4,800, so ₹1,500 realised.
    expect(res.data.realizedPL).toBe(1500);
    expect(res.data.allocations).toHaveLength(2);
    expect(res.data.allocations[0].units).toBe(30);

    const [position] = (await portfolio(u)).data.positions;
    expect(position.units).toBe(10);
    expect((await portfolio(u)).data.realizedPL).toBe(1500);
  });

  it("refuses to redeem more units than are held", async () => {
    const { u, bank } = await investor();
    await buy(u, { schemeCode: PPFAS, account: bank, units: 10, nav: 100 });
    const res = await redeem(u, { schemeCode: PPFAS, account: bank, units: 25 });
    expect(res.status).toBe(400);
    expect(res.data.code).toBe("FUND_INSUFFICIENT_UNITS");
    expect((await portfolio(u)).data.positions[0].units).toBe(10);
  });

  it("puts the units back when a redemption is deleted", async () => {
    const { u, bank } = await investor();
    await buy(u, { schemeCode: PPFAS, account: bank, units: 50, nav: 80 });
    const sale = (await redeem(u, { schemeCode: PPFAS, account: bank, units: 20, nav: 120 })).data;
    expect((await portfolio(u)).data.positions[0].units).toBe(30);

    expect((await u.session.http.delete(`/funds/redemptions/${sale._id}`)).status).toBe(200);
    const after = (await portfolio(u)).data;
    expect(after.positions[0].units).toBe(50);
    expect(after.realizedPL).toBe(0);
  });

  it("won't delete a purchase whose units have been redeemed", async () => {
    const { u, bank } = await investor();
    const lot = (await buy(u, { schemeCode: PPFAS, account: bank, units: 50, nav: 80 })).data;
    await redeem(u, { schemeCode: PPFAS, account: bank, units: 20, nav: 120 });

    const res = await u.session.http.delete(`/funds/lots/${lot._id}`);
    expect(res.status).toBe(400);
    expect(res.data.code).toBe("FUND_LOT_PARTLY_REDEEMED");
  });

  it("deletes an untouched purchase, cash and all", async () => {
    const { u, bank } = await investor();
    const lot = (await buy(u, { schemeCode: PPFAS, account: bank, amount: 5000 })).data;
    expect(await balanceOf(u, bank)).toBe(95000);
    expect((await u.session.http.delete(`/funds/lots/${lot._id}`)).status).toBe(200);
    expect(await balanceOf(u, bank)).toBe(100000);
    expect((await portfolio(u)).data.positions).toEqual([]);
  });
});

describe("Funds — the ledger legs are not loose transactions", () => {
  it("refuses to delete or re-price a purchase's transfer from the Transactions page", async () => {
    const { u, bank } = await investor();
    await buy(u, { schemeCode: PPFAS, account: bank, amount: 5000 });
    const txns = (await u.session.http.get("/transactions")).data.items as { _id: string; fundLot?: string }[];
    const leg = txns.find((t) => t.fundLot)!;
    expect(leg).toBeTruthy();

    const del = await u.session.http.delete(`/transactions/${leg._id}`);
    expect(del.status).toBe(400);
    expect(del.data.code).toBe("TXN_FUND_LOT_DELETE");

    const edit = await u.session.http.patch(`/transactions/${leg._id}`, { amount: 999 });
    expect(edit.status).toBe(400);
    expect(edit.data.code).toBe("TXN_FUND_LOT_EDIT");
  });
});

describe("Funds — SIP", () => {
  it("buys units at the day's NAV each time the rule posts", async () => {
    const { u, bank } = await investor();
    const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
    const rule = await u.session.http.post("/recurring", {
      type: "expense",
      amount: 5000,
      account: bank,
      fund: PPFAS,
      fundFolio: "12345678/91",
      frequency: "monthly",
      interval: 1,
      startDate: monthAgo,
      nextRun: monthAgo,
    });
    expect(rule.status).toBe(201);

    expect((await u.session.http.post("/recurring/run")).status).toBe(200);

    const [position] = (await portfolio(u)).data.positions;
    expect(position.units).toBe(50); // ₹5,000 at NAV ₹100
    expect(position.lots[0]).toMatchObject({ sip: true, folio: "12345678/91" });
    expect(await balanceOf(u, bank)).toBe(95000);
  });
});

describe("Funds — behind the wealth lock", () => {
  it("hides the portfolio in the everyday view", async () => {
    const { u } = await investor();
    await u.session.http.post("/settings/wealth-passcode", { passcode: "fund-passcode" });
    await u.session.http.post("/auth/lock-wealth");
    expect((await portfolio(u)).status).toBe(403);
    expect((await u.session.http.get("/funds/search?q=parag")).status).toBe(403);
  });
});
