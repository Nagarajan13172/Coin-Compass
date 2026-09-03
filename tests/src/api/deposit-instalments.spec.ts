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
      termCount: 12,
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
      termCount: 12,
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
        termCount: 12,
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
        termCount: 12,
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
        termCount: 12,
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
        termCount: 12,
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
        termCount: 12,
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
      termCount: 12,
      instalment: { amount: 1000, account: bucket._id, startDate: isoDay(7) },
    });
    expect(res.status).toBe(400);
    expect(res.data.code).toBe("ACCOUNT_SYSTEM_MANAGED");
  });

  it("rejects an instalment of nothing (400)", async () => {
    const { u, account } = await setup();
    const res = await u.session.http.post("/holdings", {
      ...RD,
      termCount: 12,
      instalment: { amount: 0, account: account._id, startDate: isoDay(7) },
    });
    expect(res.status).toBe(400);
  });

  it("won't schedule into another user's account (404)", async () => {
    const { u } = await setup();
    const stranger = await setup();
    const res = await u.session.http.post("/holdings", {
      ...RD,
      termCount: 12,
      instalment: { amount: 1000, account: stranger.account._id, startDate: isoDay(7) },
    });
    expect(res.status).toBe(404);
  });
});

describe("deposit instalments — a term with an end and a payout", () => {
  it("insists on a term for a recurring deposit", async () => {
    const { u, account } = await setup();
    // An RD without a term is just a standing order: no progress to show, no
    // maturity to reach, no payout to make.
    const res = await u.session.http.post("/holdings", {
      ...RD,
      instalment: { amount: 1000, account: account._id, startDate: isoDay(7) },
    });
    expect(res.status).toBe(400);
    expect(res.data.code).toBe("DEPOSIT_TERM_REQUIRED");

    // The same deposit without a schedule is fine — a term is only meaningful
    // alongside one.
    expect((await u.session.http.post("/holdings", RD)).status).toBe(201);
  });

  it("ends the schedule on the last instalment, not one past it", async () => {
    const { u, account } = await setup();
    const start = isoDay(7);
    const res = await u.session.http.post("/holdings", {
      ...RD,
      termCount: 12,
      instalment: { amount: 1000, account: account._id, startDate: start, frequency: "monthly", interval: 1 },
    });
    expect(res.status).toBe(201);

    // Twelve payments starting in month 0 finish in month 11.
    const expected = new Date(start);
    expected.setMonth(expected.getMonth() + 11);
    expect(String(res.data.instalment.endDate).slice(0, 10)).toBe(expected.toISOString().slice(0, 10));
  });

  it("counts instalments paid, and stops itself when the term is served", async () => {
    const { u, account } = await setup();
    // A three-instalment weekly RD that started a fortnight ago: two are due
    // now, the third next week.
    const h = (
      await u.session.http.post("/holdings", {
        ...RD,
        termCount: 3,
        payoutAccount: account._id,
        instalment: {
          amount: 1000,
          account: account._id,
          startDate: isoDay(-14),
          frequency: "weekly",
          interval: 1,
        },
      })
    ).data;
    // The schedule never back-posts, so drive it by paying in directly — the
    // same ledger legs a run would produce.
    for (const days of [-14, -7]) {
      await u.session.http.post(`/holdings/${h._id}/deposit`, {
        account: account._id,
        amount: 1000,
        date: isoDay(days),
      });
    }

    const mid = (await u.session.http.get("/holdings")).data.find((x: any) => x._id === h._id);
    expect(mid.paid).toEqual({ count: 2, total: 2000 });
    expect(mid.termCount).toBe(3);

    await u.session.http.post(`/holdings/${h._id}/deposit`, { account: account._id, amount: 1000 });
    const done = (await u.session.http.get("/holdings")).data.find((x: any) => x._id === h._id);
    expect(done.paid.count).toBe(3); // the term is served
    expect(done.value).toBe(3000);
  });

  it("doesn't let a withdrawal walk the progress backwards", async () => {
    const { u, account } = await setup();
    const h = (
      await u.session.http.post("/holdings", {
        ...RD,
        termCount: 3,
        instalment: { amount: 1000, account: account._id, startDate: isoDay(7) },
      })
    ).data;
    await u.session.http.post(`/holdings/${h._id}/deposit`, { account: account._id, amount: 1000 });
    await u.session.http.post(`/holdings/${h._id}/withdraw`, { account: account._id, amount: 400 });

    // One instalment was paid. Taking money out doesn't unpay it.
    const after = (await u.session.http.get("/holdings")).data.find((x: any) => x._id === h._id);
    expect(after.paid.count).toBe(1);
    expect(after.value).toBe(600);
  });

  it("remembers where the payout should land", async () => {
    const { u, account } = await setup();
    const payout = (await u.session.http.post("/accounts", { name: "ICICI", type: "bank" })).data;
    const h = (
      await u.session.http.post("/holdings", {
        ...RD,
        termCount: 6,
        payoutAccount: payout._id,
        instalment: { amount: 1000, account: account._id, startDate: isoDay(7) },
      })
    ).data;
    expect(String(h.payoutAccount)).toBe(payout._id);
  });
});

describe("deposit instalments — adopting a rule that was already running", () => {
  /** The RD someone set up as a plain monthly expense, before deposits existed. */
  async function handBuiltRule(u: any, account: any, extra: Record<string, unknown> = {}) {
    const category = (await u.session.http.get("/categories")).data.find(
      (c: any) => c.type === "expense"
    );
    return (
      await u.session.http.post("/recurring", {
        type: "expense",
        amount: 7000,
        account: account._id,
        category: category._id,
        note: "Insurance RD",
        frequency: "monthly",
        interval: 1,
        startDate: isoDay(-60),
        ...extra,
      })
    ).data;
  }

  it("offers the rules that aren't already spoken for", async () => {
    const { u, account } = await setup();
    const rule = await handBuiltRule(u, account);
    const rows = (await u.session.http.get("/holdings/rules")).data;
    expect(rows.map((r: any) => r._id)).toContain(rule._id);

    // A rule already feeding a deposit is not on offer — one rule, one deposit.
    const h = (
      await u.session.http.post("/holdings", {
        ...RD,
        termCount: 12,
        instalment: { amount: 1000, account: account._id, startDate: isoDay(7) },
      })
    ).data;
    const after = (await u.session.http.get("/holdings/rules")).data;
    expect(after.map((r: any) => String(r.holding))).not.toContain(h._id);
  });

  it("claims the rule rather than replacing it, so nothing is duplicated", async () => {
    const { u, account } = await setup();
    const rule = await handBuiltRule(u, account);
    const h = (await u.session.http.post("/holdings", RD)).data;

    const res = await u.session.http.post(`/holdings/${h._id}/link-rule`, { recurring: rule._id });
    expect(res.status).toBe(200);

    const rules = (await u.session.http.get("/recurring")).data;
    expect(rules).toHaveLength(1); // still one rule, not two debiting the account
    expect(rules[0]._id).toBe(rule._id); // the same one, so its history survives
    expect(rules[0].holding._id).toBe(h._id);
    // The fields the deposit path overrides are cleared, as they are for a rule
    // the app builds itself.
    expect(rules[0].category).toBeNull();
    expect(rules[0].toAccount).toBeNull();
    // And the schedule is untouched: adopting is not rescheduling.
    expect(rules[0].nextRun).toBe(rule.nextRun);
  });

  it("reads the term off the rule's own end date instead of asking again", async () => {
    const { u, account } = await setup();
    // Six monthly payments: the first on the start date, the last five months on.
    const rule = await handBuiltRule(u, account, {
      startDate: isoDay(-1),
      endDate: (() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        d.setMonth(d.getMonth() + 5);
        return d.toISOString();
      })(),
    });
    const h = (await u.session.http.post("/holdings", RD)).data;

    const res = await u.session.http.post(`/holdings/${h._id}/link-rule`, { recurring: rule._id });
    expect(res.data.termCount).toBe(6);
    const after = (await u.session.http.get("/holdings")).data.find((x: any) => x._id === h._id);
    expect(after.termCount).toBe(6);
  });

  it("finds what that rule already posted, so the history can be imported", async () => {
    const { u, account } = await setup();
    const rule = await handBuiltRule(u, account);
    // Two instalments already posted as ordinary expenses.
    await u.session.http.post(`/recurring/${rule._id}/post-one`, { amount: 7000 });
    await u.session.http.post(`/recurring/${rule._id}/post-one`, { amount: 7000 });

    const h = (await u.session.http.post("/holdings", RD)).data;
    await u.session.http.post(`/holdings/${h._id}/link-rule`, { recurring: rule._id });

    const candidates = (await u.session.http.get(`/holdings/${h._id}/candidates`)).data;
    const mine = candidates.filter((c: any) => String(c.recurring) === rule._id);
    expect(mine).toHaveLength(2);

    // Importing them makes the deposit's value and its progress agree with the
    // money that actually moved.
    const adopted = await u.session.http.post(`/holdings/${h._id}/adopt`, {
      transactions: mine.map((c: any) => c._id),
    });
    expect(adopted.data.adopted).toBe(2);
    const after = (await u.session.http.get("/holdings")).data.find((x: any) => x._id === h._id);
    expect(after.value).toBe(14000);
    expect(after.paid).toEqual({ count: 2, total: 14000 });
  });

  it("refuses a rule that is already committed elsewhere", async () => {
    const { u, account } = await setup();
    const goal = (
      await u.session.http.post("/goals", { name: "Car", targetAmount: 100000 })
    ).data;
    const rule = await handBuiltRule(u, account, { goal: goal._id });
    const h = (await u.session.http.post("/holdings", RD)).data;

    const res = await u.session.http.post(`/holdings/${h._id}/link-rule`, { recurring: rule._id });
    expect(res.status).toBe(400);
    expect(res.data.code).toBe("RULE_ALREADY_COMMITTED");
  });

  it("refuses when the deposit already has a schedule of its own", async () => {
    const { u, account } = await setup();
    const rule = await handBuiltRule(u, account);
    const h = (
      await u.session.http.post("/holdings", {
        ...RD,
        termCount: 12,
        instalment: { amount: 1000, account: account._id, startDate: isoDay(7) },
      })
    ).data;

    const res = await u.session.http.post(`/holdings/${h._id}/link-rule`, { recurring: rule._id });
    expect(res.status).toBe(400);
    expect(res.data.code).toBe("DEPOSIT_ALREADY_SCHEDULED");
  });
});
