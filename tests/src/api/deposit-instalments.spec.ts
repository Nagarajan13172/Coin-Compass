import { describe, it, expect } from "vitest";
import { createVerifiedUser } from "../harness/users";

/**
 * The standing order that feeds a deposit, described on the deposit itself.
 *
 * The thing under test is the promise the UI makes: you say "₹1,000 a month from
 * HDFC" once, on the RD, and exactly one recurring rule exists that does that —
 * created, changed and removed in step with what the deposit says.
 */

const RD = { name: "Car Insurance RD", class: "saving", subtype: "recurring_deposit", value: 0 };

/** yyyy-mm-dd, `days` from today — schedules are anchored relative to now. */
function isoDay(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function setup() {
  const u = await createVerifiedUser();
  const account = (await u.session.http.post("/accounts", { name: "HDFC", type: "bank" })).data;
  return { u, account };
}

describe("deposit instalments — the rule follows the deposit", () => {
  it("creates one rule from the deposit, with nothing the deposit path would discard", async () => {
    const { u, account } = await setup();
    const res = await u.session.http.post("/holdings", {
      ...RD,
      instalment: { amount: 1000, account: account._id, frequency: "monthly", interval: 1, startDate: isoDay(7) },
    });
    expect(res.status).toBe(201);

    const rules = (await u.session.http.get("/recurring")).data;
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ amount: 1000, holding: { _id: res.data._id }, active: true });
    expect(rules[0].account._id).toBe(account._id);
    // The three fields the old form demanded and depositService then overrode.
    expect(rules[0].category).toBeNull();
    expect(rules[0].toAccount).toBeNull();
    // The holding carries its own schedule back, so the card needs no second call.
    expect(res.data.instalment).toMatchObject({ amount: 1000 });
  });

  it("never back-posts: a start date in the past anchors to the next instalment", async () => {
    const { u, account } = await setup();
    // Six months of instalments already paid. Those belong to "Import past
    // payments" — a new schedule must not fire them all on its first run.
    const created = await u.session.http.post("/holdings", {
      ...RD,
      instalment: { amount: 1000, account: account._id, startDate: isoDay(-180) },
    });
    const rule = created.data.instalment;
    expect(new Date(rule.nextRun).getTime()).toBeGreaterThan(Date.now());

    const posted = await u.session.http.post("/recurring/run", {});
    expect(posted.data.created).toBe(0);
    expect((await u.session.http.get(`/holdings`)).data[0].value).toBe(0);
  });

  it("edits the same rule in place rather than replacing it", async () => {
    const { u, account } = await setup();
    const h = (
      await u.session.http.post("/holdings", {
        ...RD,
        instalment: { amount: 1000, account: account._id, startDate: isoDay(7) },
      })
    ).data;
    const before = h.instalment;

    const upd = await u.session.http.patch(`/holdings/${h._id}`, {
      instalment: { amount: 2500, account: account._id, startDate: isoDay(7) },
    });
    expect(upd.data.instalment._id).toBe(before._id); // same rule, so its history survives
    expect(upd.data.instalment.amount).toBe(2500);
    // Changing the amount must not move the schedule's position.
    expect(upd.data.instalment.nextRun).toBe(before.nextRun);
    expect((await u.session.http.get("/recurring")).data).toHaveLength(1);
  });

  it("leaves the schedule alone when the request doesn't mention it", async () => {
    const { u, account } = await setup();
    const h = (
      await u.session.http.post("/holdings", {
        ...RD,
        instalment: { amount: 1000, account: account._id, startDate: isoDay(7) },
      })
    ).data;

    // A plain rename. Cancelling someone's RD as a side effect would be a bug of
    // the worst kind: silent, and only noticed months later.
    const upd = await u.session.http.patch(`/holdings/${h._id}`, { name: "Car Insurance" });
    expect(upd.data.instalment).toMatchObject({ _id: h.instalment._id, amount: 1000 });
    expect((await u.session.http.get("/recurring")).data).toHaveLength(1);
  });

  it("stops the rule when the schedule is switched off", async () => {
    const { u, account } = await setup();
    const h = (
      await u.session.http.post("/holdings", {
        ...RD,
        instalment: { amount: 1000, account: account._id, startDate: isoDay(7) },
      })
    ).data;

    const upd = await u.session.http.patch(`/holdings/${h._id}`, { instalment: null });
    expect(upd.data.instalment).toBeNull();
    expect((await u.session.http.get("/recurring")).data).toHaveLength(0);
  });

  it("takes the rule with it when the deposit is deleted", async () => {
    const { u, account } = await setup();
    const h = (
      await u.session.http.post("/holdings", {
        ...RD,
        instalment: { amount: 1000, account: account._id, startDate: isoDay(7) },
      })
    ).data;

    await u.session.http.delete(`/holdings/${h._id}`);
    // A rule pointing at a deleted holding throws on every run and stalls,
    // silently holding back every other instalment behind it.
    expect((await u.session.http.get("/recurring")).data).toHaveLength(0);
  });
});

describe("deposit instalments — what the run actually posts", () => {
  it("moves money into the deposit as a transfer, leaving spending untouched", async () => {
    const { u, account } = await setup();
    const h = (
      await u.session.http.post("/holdings", {
        ...RD,
        instalment: { amount: 1000, account: account._id, startDate: isoDay(0) },
      })
    ).data;

    expect((await u.session.http.post("/recurring/run", {})).data.created).toBe(1);

    const holdings = (await u.session.http.get("/holdings")).data;
    expect(holdings.find((x: any) => x._id === h._id).value).toBe(1000);

    const txns = (await u.session.http.get("/transactions", { params: { limit: 50 } })).data;
    const rows = txns.items ?? txns;
    expect(rows).toHaveLength(1);
    // Saving is not spending: a transfer, uncategorised, into the app's bucket.
    expect(rows[0].type).toBe("transfer");
    expect(rows[0].category).toBeNull();
    expect(rows[0].account._id).toBe(account._id);
  });
});

describe("deposit instalments — what it refuses", () => {
  it("won't fund an instalment from an app-managed bucket", async () => {
    const { u, account } = await setup();
    // Paying into a deposit creates the Savings & Deposits bucket. Funding the
    // next instalment *from* it would break the invariant that the bucket equals
    // the principal the holdings hold.
    const h = (await u.session.http.post("/holdings", RD)).data;
    await u.session.http.post(`/holdings/${h._id}/deposit`, { account: account._id, amount: 500 });
    const bucket = (await u.session.http.get("/accounts")).data.find((a: any) => a.type === "deposits");
    expect(bucket).toBeTruthy();

    const res = await u.session.http.patch(`/holdings/${h._id}`, {
      instalment: { amount: 1000, account: bucket._id, startDate: isoDay(7) },
    });
    expect(res.status).toBe(400);
    expect(res.data.code).toBe("ACCOUNT_SYSTEM_MANAGED");
  });

  it("rejects an instalment of nothing (400)", async () => {
    const { u, account } = await setup();
    const res = await u.session.http.post("/holdings", {
      ...RD,
      instalment: { amount: 0, account: account._id, startDate: isoDay(7) },
    });
    expect(res.status).toBe(400);
  });

  it("won't schedule into another user's account (404)", async () => {
    const { u } = await setup();
    const stranger = await setup();
    const res = await u.session.http.post("/holdings", {
      ...RD,
      instalment: { amount: 1000, account: stranger.account._id, startDate: isoDay(7) },
    });
    expect(res.status).toBe(404);
  });
});
