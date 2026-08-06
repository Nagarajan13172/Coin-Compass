import { describe, it, expect } from "vitest";
import { createVerifiedUser, type TestUser } from "../harness/users";

/**
 * Stocks & Demat — the ledger invariants.
 *
 * The server runs on the stub price provider (see harness/server.ts), so every
 * symbol is worth exactly STUB_PRICE. That makes each expectation below an exact
 * figure rather than a tolerance, which is the point: these assert what the
 * feature is *supposed* to do, not what it currently happens to produce.
 *
 * The design being protected: a demat account's balance is only the idle cash at
 * the broker, the shares are lots valued at market, and purchases move cash into
 * an excluded "Stock Investments" bucket so nothing is ever counted twice.
 */

const STUB_PRICE = 100;

async function demat(u: TestUser, name = "Zerodha") {
  const res = await u.session.http.post("/accounts", { name, type: "demat", initialBalance: 0 });
  expect(res.status).toBe(201);
  return res.data;
}

async function bank(u: TestUser, initialBalance = 100_000) {
  return (await u.session.http.post("/accounts", { name: "HDFC", type: "bank", initialBalance })).data;
}

/** Net worth as the server computes it — the figure the trend and cards share. */
async function netWorth(u: TestUser): Promise<number> {
  const res = await u.session.http.get("/networth/history");
  expect(res.status).toBe(200);
  return res.data.at(-1).netWorth;
}

async function snapshot(u: TestUser) {
  return (await u.session.http.get("/networth/history")).data.at(-1);
}

async function accountsByName(u: TestUser): Promise<Record<string, any>> {
  const res = await u.session.http.get("/accounts");
  return Object.fromEntries(res.data.map((a: any) => [a.name, a]));
}

const buy = (u: TestUser, body: Record<string, unknown>) => u.session.http.post("/stocks/buy", body);
const sell = (u: TestUser, body: Record<string, unknown>) => u.session.http.post("/stocks/sell", body);
const portfolio = (u: TestUser) => u.session.http.get("/stocks/portfolio");

describe("Stocks — demat account", () => {
  it("creates a demat account like any other (201)", async () => {
    const u = await createVerifiedUser();
    const acc = await demat(u);
    expect(acc).toMatchObject({ name: "Zerodha", type: "demat" });
  });

  it("refuses to hold stock in a non-demat account (400)", async () => {
    const u = await createVerifiedUser();
    const hdfc = await bank(u);
    const res = await buy(u, { symbol: "TCS.NS", demat: hdfc._id, qty: 1, buyPrice: 100 });
    expect(res.status).toBe(400);
  });

  it("never lets a user create a system bucket by hand (400)", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.post("/accounts", { name: "Sneaky", type: "securities" });
    expect(res.status).toBe(400);
  });

  // INVARIANT 1 — funding is a transfer between two of your own pockets.
  it("funding a demat account leaves net worth unchanged", async () => {
    const u = await createVerifiedUser();
    const d = await demat(u);
    const hdfc = await bank(u, 100_000);

    const before = await netWorth(u);
    const res = await u.session.http.post("/transactions", {
      type: "transfer", amount: 50_000, account: hdfc._id, toAccount: d._id,
    });
    expect(res.status).toBe(201);

    expect(await netWorth(u)).toBe(before);
    const accounts = await accountsByName(u);
    expect(accounts.HDFC.balance).toBe(50_000);
    expect(accounts.Zerodha.balance).toBe(50_000);
  });
});

describe("Stocks — buying", () => {
  // INVARIANT 2 — at the moment of purchase the shares are worth what was paid
  // for them, so the only thing lost is the brokerage.
  it("changes net worth by exactly the fees", async () => {
    const u = await createVerifiedUser();
    const d = await demat(u);
    const hdfc = await bank(u, 100_000);
    await u.session.http.post("/transactions", {
      type: "transfer", amount: 50_000, account: hdfc._id, toAccount: d._id,
    });

    const before = await netWorth(u);
    // 100 shares at the stub price, so market value equals cost less fees.
    const res = await buy(u, {
      symbol: "TCS.NS", demat: d._id, qty: 100, buyPrice: STUB_PRICE, fees: 25,
    });
    expect(res.status).toBe(201);

    expect(await netWorth(u)).toBe(before - 25);
  });

  it("moves cash out of the demat account and into the excluded bucket", async () => {
    const u = await createVerifiedUser();
    const d = await demat(u);
    const hdfc = await bank(u, 100_000);
    await u.session.http.post("/transactions", {
      type: "transfer", amount: 50_000, account: hdfc._id, toAccount: d._id,
    });
    await buy(u, { symbol: "TCS.NS", demat: d._id, qty: 100, buyPrice: 90, fees: 25 });

    const accounts = await accountsByName(u);
    expect(accounts.Zerodha.balance).toBe(50_000 - 9_025); // 100 × 90 + 25
    // The bucket holds cost basis and must stay out of the totals, or the
    // position would be counted at cost AND at market.
    expect(accounts["Stock Investments"].balance).toBe(9_025);
    expect(accounts["Stock Investments"].includeInTotal).toBe(false);
  });

  // INVARIANT 3 — the same net worth, reached two independent ways.
  it("reconciles: cash + market value equals the assets total", async () => {
    const u = await createVerifiedUser();
    const d = await demat(u);
    const hdfc = await bank(u, 100_000);
    await u.session.http.post("/transactions", {
      type: "transfer", amount: 50_000, account: hdfc._id, toAccount: d._id,
    });
    await buy(u, { symbol: "TCS.NS", demat: d._id, qty: 100, buyPrice: 90, fees: 0 });

    const accounts = await accountsByName(u);
    const cash = accounts.HDFC.balance + accounts.Zerodha.balance;
    const market = (await portfolio(u)).data.totals.marketValue;
    const snap = await snapshot(u);

    expect(market).toBe(100 * STUB_PRICE);
    expect(snap.assets).toBe(cash + market);
    expect(snap.stocksTotal).toBe(market);
  });

  it("folds the position into `investment`, so the donut picks it up unchanged", async () => {
    const u = await createVerifiedUser();
    const d = await demat(u);
    await buy(u, { symbol: "TCS.NS", demat: d._id, qty: 10, buyPrice: 90, recordCash: false });

    const snap = await snapshot(u);
    expect(snap.stocksTotal).toBe(10 * STUB_PRICE);
    expect(snap.investment).toBe(snap.stocksTotal);
    expect(snap.holdingsTotal).toBe(snap.saving + snap.investment);
  });

  it("records pre-existing shares without inventing a cash movement", async () => {
    const u = await createVerifiedUser();
    const d = await demat(u);
    await buy(u, { symbol: "TCS.NS", demat: d._id, qty: 10, buyPrice: 90, recordCash: false });

    const accounts = await accountsByName(u);
    expect(accounts.Zerodha.balance).toBe(0); // untouched
    // The bucket still carries the cost basis, so a later sale has capital to return.
    expect(accounts["Stock Investments"].balance).toBe(900);
    const txns = (await u.session.http.get("/transactions")).data;
    expect(txns.items ?? txns).toHaveLength(0);
  });

  it("prices a new position immediately rather than leaving it at cost", async () => {
    const u = await createVerifiedUser();
    const d = await demat(u);
    await buy(u, { symbol: "TCS.NS", demat: d._id, qty: 10, buyPrice: 80, recordCash: false });

    const pos = (await portfolio(u)).data.positions[0];
    expect(pos.price).toBe(STUB_PRICE);
    expect(pos.unrealized).toBe(200); // 10 × (100 − 80)
  });
});

describe("Stocks — selling", () => {
  /** A user holding two lots of TCS: 10 @ ₹80 (older), then 10 @ ₹90. */
  async function withTwoLots() {
    const u = await createVerifiedUser();
    const d = await demat(u);
    await buy(u, {
      symbol: "TCS.NS", demat: d._id, qty: 10, buyPrice: 80,
      buyDate: "2025-01-10", recordCash: false,
    });
    await buy(u, {
      symbol: "TCS.NS", demat: d._id, qty: 10, buyPrice: 90,
      buyDate: "2025-11-10", recordCash: false,
    });
    return { u, d };
  }

  // INVARIANT 5 — oldest lot first.
  it("consumes the oldest lot first, then spills into the next", async () => {
    const { u, d } = await withTwoLots();
    const res = await sell(u, {
      symbol: "TCS.NS", demat: d._id, qty: 15, sellPrice: 120, sellDate: "2026-02-01",
    });
    expect(res.status).toBe(201);
    expect(res.data.allocations.map((a: any) => a.qty)).toEqual([10, 5]);

    const pos = (await portfolio(u)).data.positions[0];
    expect(pos.qty).toBe(5); // only the newer lot's remainder is left
  });

  // INVARIANT 6 — proceeds less cost less fees, split by holding period.
  it("books the gain, split into short- and long-term", async () => {
    const { u, d } = await withTwoLots();
    const sale = (await sell(u, {
      symbol: "TCS.NS", demat: d._id, qty: 15, sellPrice: 120, sellDate: "2026-02-01",
    })).data;

    // Lot 1 (Jan 2025) is long-term by Feb 2026: 10 × (120 − 80) = 400.
    // Lot 2 (Nov 2025) is still short-term:      5 × (120 − 90) = 150.
    expect(sale.realizedLongTerm).toBe(400);
    expect(sale.realizedShortTerm).toBe(150);
    expect(sale.realizedPL).toBe(550);
    expect(sale.allocations.map((a: any) => a.gainType)).toEqual(["LTCG", "STCG"]);
  });

  it("lands the full net proceeds in the demat account", async () => {
    const { u, d } = await withTwoLots();
    await sell(u, {
      symbol: "TCS.NS", demat: d._id, qty: 15, sellPrice: 120, sellDate: "2026-02-01", fees: 50,
    });

    const accounts = await accountsByName(u);
    // 15 × 120 = 1800 gross, less ₹50 of charges.
    expect(accounts.Zerodha.balance).toBe(1750);
    // Cost basis of the two consumed slices (800 + 450) has left the bucket,
    // leaving exactly the remaining 5 shares' cost.
    expect(accounts["Stock Investments"].balance).toBe(450);
  });

  it("shows the realized gain as income in reports", async () => {
    const { u, d } = await withTwoLots();
    await sell(u, {
      symbol: "TCS.NS", demat: d._id, qty: 15, sellPrice: 120, sellDate: "2026-02-01",
    });

    const txns = (await u.session.http.get("/transactions")).data;
    const items = txns.items ?? txns;
    const gain = items.find((t: any) => t.type === "income" && t.stockRealized);
    expect(gain).toBeTruthy();
    expect(gain.amount).toBe(550);
  });

  it("books a loss as an expense, not as negative income", async () => {
    const { u, d } = await withTwoLots();
    await sell(u, {
      symbol: "TCS.NS", demat: d._id, qty: 10, sellPrice: 50, sellDate: "2026-02-01",
    });

    const items = (await u.session.http.get("/transactions")).data;
    const loss = (items.items ?? items).find((t: any) => t.type === "expense" && t.stockRealized);
    expect(loss.amount).toBe(300); // 10 × (80 − 50)
    expect(loss.stockRealized).toBe(-300);
  });

  it("refuses to sell more than is held (400)", async () => {
    const { u, d } = await withTwoLots();
    const res = await sell(u, { symbol: "TCS.NS", demat: d._id, qty: 25, sellPrice: 120 });
    expect(res.status).toBe(400);
    expect(res.data.code).toBe("STOCK_INSUFFICIENT_QTY");

    // …and nothing was consumed by the attempt.
    expect((await portfolio(u)).data.positions[0].qty).toBe(20);
  });

  it("drops a fully-exited stock from the portfolio but keeps its realized gain", async () => {
    const { u, d } = await withTwoLots();
    await sell(u, {
      symbol: "TCS.NS", demat: d._id, qty: 20, sellPrice: 120, sellDate: "2026-02-01",
    });

    const p = (await portfolio(u)).data;
    expect(p.positions).toHaveLength(0);
    expect(p.totals.marketValue).toBe(0);
    expect(p.totals.realizedPL).toBe(700); // 400 + 300
  });
});

describe("Stocks — reversing a sale", () => {
  // INVARIANT 7 — deleting a sale restores exactly what it consumed.
  it("puts back the exact quantity each lot gave up", async () => {
    const u = await createVerifiedUser();
    const d = await demat(u);
    await buy(u, { symbol: "TCS.NS", demat: d._id, qty: 10, buyPrice: 80, buyDate: "2025-01-10", recordCash: false });
    await buy(u, { symbol: "TCS.NS", demat: d._id, qty: 10, buyPrice: 90, buyDate: "2025-11-10", recordCash: false });

    const before = (await portfolio(u)).data.positions[0];
    const sale = (await sell(u, {
      symbol: "TCS.NS", demat: d._id, qty: 15, sellPrice: 120, sellDate: "2026-02-01",
    })).data;

    expect((await u.session.http.delete(`/stocks/sales/${sale._id}`)).status).toBe(200);

    const after = (await portfolio(u)).data.positions[0];
    expect(after.qty).toBe(before.qty);
    expect(after.investedCost).toBe(before.investedCost);
    expect((await portfolio(u)).data.totals.realizedPL).toBe(0);
  });

  it("removes both ledger legs with the sale", async () => {
    const u = await createVerifiedUser();
    const d = await demat(u);
    await buy(u, { symbol: "TCS.NS", demat: d._id, qty: 10, buyPrice: 80, recordCash: false });
    const sale = (await sell(u, { symbol: "TCS.NS", demat: d._id, qty: 10, sellPrice: 120 })).data;

    await u.session.http.delete(`/stocks/sales/${sale._id}`);

    const accounts = await accountsByName(u);
    expect(accounts.Zerodha.balance).toBe(0);
    expect(accounts["Stock Investments"].balance).toBe(800); // back to the lot's cost
  });

  it("refuses to delete a purchase that has been partly sold (400)", async () => {
    const u = await createVerifiedUser();
    const d = await demat(u);
    const lot = (await buy(u, {
      symbol: "TCS.NS", demat: d._id, qty: 10, buyPrice: 80, recordCash: false,
    })).data;
    await sell(u, { symbol: "TCS.NS", demat: d._id, qty: 4, sellPrice: 120 });

    const res = await u.session.http.delete(`/stocks/lots/${lot._id}`);
    expect(res.status).toBe(400);
    expect(res.data.code).toBe("STOCK_LOT_PARTLY_SOLD");
  });

  it("deleting an untouched purchase takes its cost back out of the bucket", async () => {
    const u = await createVerifiedUser();
    const d = await demat(u);
    const lot = (await buy(u, {
      symbol: "TCS.NS", demat: d._id, qty: 10, buyPrice: 80, recordCash: false,
    })).data;

    expect((await u.session.http.delete(`/stocks/lots/${lot._id}`)).status).toBe(200);
    expect((await accountsByName(u))["Stock Investments"].balance).toBe(0);
    expect((await portfolio(u)).data.positions).toHaveLength(0);
  });
});

describe("Stocks — the LTCG clock", () => {
  // INVARIANT 8 — the reason lots are tracked individually at all.
  it("counts down to long-term status per lot", async () => {
    const u = await createVerifiedUser();
    const d = await demat(u);
    // Bought well over a year ago → already long-term.
    await buy(u, { symbol: "TCS.NS", demat: d._id, qty: 5, buyPrice: 80, buyDate: "2024-01-10", recordCash: false });
    // Bought recently → still counting down.
    await buy(u, { symbol: "TCS.NS", demat: d._id, qty: 5, buyPrice: 90, buyDate: "2026-07-01", recordCash: false });

    const lots = (await portfolio(u)).data.positions[0].lots;
    const [old, recent] = lots;
    expect(old.longTerm).toBe(true);
    expect(old.daysToLongTerm).toBe(0);
    expect(recent.longTerm).toBe(false);
    expect(recent.daysToLongTerm).toBeGreaterThan(0);
  });
});

describe("Stocks — validation & isolation", () => {
  it("rejects a symbol that isn't an NSE/BSE listing (400)", async () => {
    const u = await createVerifiedUser();
    const d = await demat(u);
    for (const symbol of ["INFY", "AAPL", "RELIANCE.L", "'; DROP TABLE"]) {
      const res = await buy(u, { symbol, demat: d._id, qty: 1, buyPrice: 100 });
      expect(res.status).toBe(400);
    }
  });

  it("rejects a non-positive quantity (400)", async () => {
    const u = await createVerifiedUser();
    const d = await demat(u);
    expect((await buy(u, { symbol: "TCS.NS", demat: d._id, qty: 0, buyPrice: 100 })).status).toBe(400);
    expect((await buy(u, { symbol: "TCS.NS", demat: d._id, qty: -5, buyPrice: 100 })).status).toBe(400);
  });

  it("keeps one user's portfolio out of another's", async () => {
    const owner = await createVerifiedUser();
    const od = await demat(owner);
    await buy(owner, { symbol: "TCS.NS", demat: od._id, qty: 10, buyPrice: 80, recordCash: false });

    const stranger = await createVerifiedUser();
    expect((await portfolio(stranger)).data.positions).toHaveLength(0);

    // …and cannot spend the owner's demat account either.
    const res = await buy(stranger, { symbol: "TCS.NS", demat: od._id, qty: 1, buyPrice: 80 });
    expect(res.status).toBe(404);
  });

  it("404s when deleting another user's sale", async () => {
    const owner = await createVerifiedUser();
    const od = await demat(owner);
    await buy(owner, { symbol: "TCS.NS", demat: od._id, qty: 10, buyPrice: 80, recordCash: false });
    const sale = (await sell(owner, { symbol: "TCS.NS", demat: od._id, qty: 5, sellPrice: 120 })).data;

    const stranger = await createVerifiedUser();
    expect((await stranger.session.http.delete(`/stocks/sales/${sale._id}`)).status).toBe(404);
  });

  // INVARIANT 12 — stocks reveal net worth, so they follow the same lock.
  it("403s every stocks route once the wealth lock is engaged", async () => {
    const u = await createVerifiedUser();
    const d = await demat(u);
    await buy(u, { symbol: "TCS.NS", demat: d._id, qty: 1, buyPrice: 80, recordCash: false });

    expect((await portfolio(u)).status).toBe(200);
    await u.session.http.post("/settings/wealth-passcode", { passcode: "1357" });
    await u.session.http.post("/auth/lock-wealth");

    expect((await portfolio(u)).status).toBe(403);
    expect((await u.session.http.get("/stocks/sales")).status).toBe(403);
    expect((await buy(u, { symbol: "TCS.NS", demat: d._id, qty: 1, buyPrice: 80 })).status).toBe(403);
  });
});

describe("Stocks — global price cache", () => {
  // INVARIANT 10 — prices are keyed by symbol, not by user. Two holders of the
  // same stock share one row, which is what makes an un-batchable upstream
  // endpoint affordable.
  it("values the same symbol identically for two different users", async () => {
    const a = await createVerifiedUser();
    const b = await createVerifiedUser();
    const ad = await demat(a, "Zerodha");
    const bd = await demat(b, "Groww");

    await buy(a, { symbol: "TCS.NS", demat: ad._id, qty: 10, buyPrice: 80, recordCash: false });
    await buy(b, { symbol: "TCS.NS", demat: bd._id, qty: 3, buyPrice: 95, recordCash: false });

    const pa = (await portfolio(a)).data.positions[0];
    const pb = (await portfolio(b)).data.positions[0];
    expect(pa.price).toBe(pb.price);
    expect(pa.marketValue).toBe(10 * STUB_PRICE);
    expect(pb.marketValue).toBe(3 * STUB_PRICE);
  });

  it("reports allocation shares that add up across positions", async () => {
    const u = await createVerifiedUser();
    const d = await demat(u);
    await buy(u, { symbol: "TCS.NS", demat: d._id, qty: 30, buyPrice: 80, recordCash: false });
    await buy(u, { symbol: "INFY.NS", demat: d._id, qty: 10, buyPrice: 80, recordCash: false });

    const positions = (await portfolio(u)).data.positions;
    expect(positions.map((p: any) => p.allocationPct)).toEqual([75, 25]);
  });
});
