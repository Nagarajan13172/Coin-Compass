import { describe, it, expect } from "vitest";
import { createVerifiedUser, type TestUser } from "../harness/users";

/**
 * Two levels of settle-up. A person has ONE overall balance, but each individual
 * lend can also be settled on its own — so "Hari paid me back for the KFC bill"
 * clears that entry, not just some of his total.
 *
 * Per-entry figures are derived (see allocateOutstanding), and these specs pin
 * the guarantee that they always add back up to the person's overall balance.
 */

const INITIAL = 50_000;
const bank = async (u: TestUser) =>
  (await u.session.http.post("/accounts", { name: "Bank", type: "bank", initialBalance: INITIAL })).data;

const lend = (u: TestUser, amount: number, date: string, extra: Record<string, unknown> = {}) =>
  u.session.http.post("/credits", { person: "Hari", direction: "given", amount, date, ...extra });

const repay = (u: TestUser, amount: number, extra: Record<string, unknown> = {}) =>
  u.session.http.post("/credits", { person: "Hari", direction: "received", amount, ...extra });

/** The person's card: overall balance plus each entry's own outstanding. */
async function hari(u: TestUser) {
  const rows = (await u.session.http.get("/credits/summary")).data;
  return rows.find((r: any) => r.person === "Hari");
}
const lendsOf = (h: any) => h.entries.filter((e: any) => e.direction === "given");
const byAmount = (h: any, amount: number) => lendsOf(h).find((e: any) => e.amount === amount);

describe("Settle up — one individual entry", () => {
  it("reports each lend's own outstanding, not just the person's total", async () => {
    const u = await createVerifiedUser();
    await lend(u, 500, "2026-08-01");
    await lend(u, 2000, "2026-08-02");

    const h = await hari(u);
    expect(h.net).toBe(2500);
    expect(byAmount(h, 500).outstanding).toBe(500);
    expect(byAmount(h, 2000).outstanding).toBe(2000);
    expect(lendsOf(h).every((e: any) => e.settled === false)).toBe(true);
  });

  it("settling ONE entry clears that entry and leaves the other alone", async () => {
    const u = await createVerifiedUser();
    const kfc = (await lend(u, 500, "2026-08-01")).data;
    await lend(u, 2000, "2026-08-02");

    await repay(u, 500, { settles: kfc._id });

    const h = await hari(u);
    expect(byAmount(h, 500)).toMatchObject({ outstanding: 0, settled: true });
    expect(byAmount(h, 2000)).toMatchObject({ outstanding: 2000, settled: false });
    expect(h.net).toBe(2000);
  });

  it("settles the NAMED entry even when an older one is still open", async () => {
    const u = await createVerifiedUser();
    await lend(u, 500, "2026-08-01"); // older
    const newer = (await lend(u, 800, "2026-08-09")).data;

    await repay(u, 800, { settles: newer._id });

    const h = await hari(u);
    expect(byAmount(h, 800)).toMatchObject({ outstanding: 0, settled: true });
    expect(byAmount(h, 500)).toMatchObject({ outstanding: 500, settled: false }); // untouched
  });

  it("a part payment on one entry leaves the rest of it outstanding", async () => {
    const u = await createVerifiedUser();
    const kfc = (await lend(u, 500, "2026-08-01")).data;
    await repay(u, 200, { settles: kfc._id });

    const h = await hari(u);
    expect(byAmount(h, 500)).toMatchObject({ outstanding: 300, settled: false });
  });

  it("overpaying one entry rolls the excess onto the others, never going negative", async () => {
    const u = await createVerifiedUser();
    const kfc = (await lend(u, 500, "2026-08-01")).data;
    await lend(u, 800, "2026-08-02");

    await repay(u, 700, { settles: kfc._id }); // 200 more than that entry

    const h = await hari(u);
    expect(byAmount(h, 500)).toMatchObject({ outstanding: 0, settled: true });
    expect(byAmount(h, 800).outstanding).toBe(600); // the extra 200 landed here
  });
});

describe("Settle up — the person's whole balance", () => {
  it("a general repayment pays the oldest lend first", async () => {
    const u = await createVerifiedUser();
    await lend(u, 500, "2026-08-01");
    await lend(u, 800, "2026-08-09");

    await repay(u, 500); // no `settles` — settling at the person level

    const h = await hari(u);
    expect(byAmount(h, 500)).toMatchObject({ outstanding: 0, settled: true });
    expect(byAmount(h, 800)).toMatchObject({ outstanding: 800, settled: false });
  });

  it("settling the whole balance clears every entry at once", async () => {
    const u = await createVerifiedUser();
    await lend(u, 500, "2026-08-01");
    await lend(u, 2000, "2026-08-02");

    await repay(u, 2500);

    const h = await hari(u);
    expect(h.net).toBe(0);
    expect(lendsOf(h).every((e: any) => e.settled === true)).toBe(true);
  });
});

describe("Settle up — the two levels always agree", () => {
  /** Σ(per-entry outstanding) must equal the person's net, or the card and its
   *  own rows would be telling the user two different things. */
  const sums = (h: any) =>
    lendsOf(h).reduce((s: number, e: any) => s + e.outstanding, 0);

  it("agrees with nothing repaid", async () => {
    const u = await createVerifiedUser();
    await lend(u, 500, "2026-08-01");
    await lend(u, 2000, "2026-08-02");
    const h = await hari(u);
    expect(sums(h)).toBe(Math.max(0, h.net));
  });

  it("agrees after settling one entry", async () => {
    const u = await createVerifiedUser();
    const a = (await lend(u, 500, "2026-08-01")).data;
    await lend(u, 2000, "2026-08-02");
    await repay(u, 500, { settles: a._id });
    const h = await hari(u);
    expect(sums(h)).toBe(Math.max(0, h.net));
  });

  it("agrees after mixing a per-entry and a person-level settle", async () => {
    const u = await createVerifiedUser();
    const a = (await lend(u, 500, "2026-08-01")).data;
    await lend(u, 2000, "2026-08-02");
    await repay(u, 500, { settles: a._id });
    await repay(u, 700); // general
    const h = await hari(u);
    expect(sums(h)).toBe(Math.max(0, h.net));
    expect(byAmount(h, 2000).outstanding).toBe(1300);
  });

  it("agrees when they have overpaid overall", async () => {
    const u = await createVerifiedUser();
    await lend(u, 500, "2026-08-01");
    await repay(u, 900);
    const h = await hari(u);
    expect(h.net).toBe(-400); // you now owe them
    expect(sums(h)).toBe(0); // …and no lend is outstanding
  });
});

describe("Settle up — money still moves correctly", () => {
  it("a per-entry settle is a TRANSFER back, never income", async () => {
    const u = await createVerifiedUser();
    const acc = await bank(u);
    const kfc = (await lend(u, 500, "2026-08-01", { account: acc._id, reflected: true })).data;

    await repay(u, 500, { settles: kfc._id, account: acc._id, reflected: true });

    const accounts = (await u.session.http.get("/accounts")).data;
    expect(accounts.find((a: any) => a.name === "Bank").balance).toBe(INITIAL);
    expect(accounts.find((a: any) => a.name === "Money Lent").balance).toBe(0);
    expect((await u.session.http.get("/transactions/summary")).data.income).toBe(0);
  });

  it("settling one share of a split clears just that person's share", async () => {
    const u = await createVerifiedUser();
    const acc = await bank(u);
    await u.session.http.post("/splits", {
      description: "KFC",
      totalAmount: 3000,
      yourShare: 500,
      account: acc._id,
      participants: [
        { person: "Hari", amount: 500 },
        { person: "Meera", amount: 500 },
        { person: "Arjun", amount: 500 },
        { person: "Kumar", amount: 500 },
        { person: "Divya", amount: 500 },
      ],
    });

    const h = await hari(u);
    const share = lendsOf(h)[0];
    expect(share.outstanding).toBe(500);

    await repay(u, 500, { settles: share._id, account: acc._id, reflected: true });

    const after = await hari(u);
    expect(lendsOf(after)[0]).toMatchObject({ outstanding: 0, settled: true });
    // The other four still owe theirs.
    expect((await u.session.http.get("/accounts")).data.find((a: any) => a.name === "Money Lent").balance).toBe(2000);
    expect((await u.session.http.get("/transactions/summary")).data.income).toBe(0);
  });

  it("deleting the lend a repayment settled keeps the money, dropping to a general payment", async () => {
    const u = await createVerifiedUser();
    await lend(u, 500, "2026-08-01");
    const b = (await lend(u, 800, "2026-08-02")).data;
    await repay(u, 800, { settles: b._id });

    expect((await u.session.http.delete(`/credits/${b._id}`)).status).toBe(200);

    // The 800 didn't vanish — with its target gone it pays down what's left.
    const h = await hari(u);
    expect(h.net).toBe(-300);
    expect(byAmount(h, 500).outstanding).toBe(0);
  });
});
