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
    expect(mid.paid).toEqual({ count: 2, total: 2000, imported: 0 });
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
    expect(after.paid).toEqual({ count: 2, total: 14000, imported: 2 });
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

describe("deposit instalments — taking an import back", () => {
  /** An RD paid as a plain categorised expense, twice. */
  async function pastExpenses(u: any, account: any) {
    const category = (await u.session.http.get("/categories")).data.find(
      (c: any) => c.type === "expense"
    );
    const ids: string[] = [];
    for (const days of [-60, -30]) {
      const txn = (
        await u.session.http.post("/transactions", {
          type: "expense",
          amount: 7000,
          account: account._id,
          category: category._id,
          date: isoDay(days),
          note: "Car Insurance RD instalment",
        })
      ).data;
      ids.push(txn._id);
    }
    return { ids, category };
  }

  it("restores the expense and its category, not just the link", async () => {
    const { u, account } = await setup();
    const { ids, category } = await pastExpenses(u, account);
    const h = (await u.session.http.post("/holdings", RD)).data;

    await u.session.http.post(`/holdings/${h._id}/adopt`, { transactions: ids });
    const imported = (await u.session.http.get("/holdings")).data.find((x: any) => x._id === h._id);
    expect(imported.value).toBe(14000);
    expect(imported.paid.imported).toBe(2);

    const undone = await u.session.http.post(`/holdings/${h._id}/unadopt`, {});
    expect(undone.data.restored).toBe(2);

    // The deposit gives back what the import added.
    const after = (await u.session.http.get("/holdings")).data.find((x: any) => x._id === h._id);
    expect(after.value).toBe(0);
    expect(after.paid).toEqual({ count: 0, total: 0, imported: 0 });

    // And the transactions are expenses again, categorised as they were —
    // an uncategorised transfer would be no more correct than a spend.
    const txns = (await u.session.http.get("/transactions", { params: { limit: 50 } })).data;
    const rows = (txns.items ?? txns).filter((r: any) => ids.includes(r._id));
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.type).toBe("expense");
      expect(r.category?._id ?? r.category).toBe(category._id);
      expect(r.holding).toBeNull();
    }
  });

  it("leaves instalments that were deposits from the start alone", async () => {
    const { u, account } = await setup();
    const { ids } = await pastExpenses(u, account);
    const h = (await u.session.http.post("/holdings", RD)).data;

    await u.session.http.post(`/holdings/${h._id}/adopt`, { transactions: ids });
    // One genuine deposit on top of the two imported ones.
    await u.session.http.post(`/holdings/${h._id}/deposit`, { account: account._id, amount: 1000 });

    const undone = await u.session.http.post(`/holdings/${h._id}/unadopt`, {});
    expect(undone.data.restored).toBe(2); // only the imported pair

    const after = (await u.session.http.get("/holdings")).data.find((x: any) => x._id === h._id);
    expect(after.value).toBe(1000); // the real deposit survives untouched
    expect(after.paid).toEqual({ count: 1, total: 1000, imported: 0 });
  });

  it("does nothing when there is nothing to put back", async () => {
    const { u, account } = await setup();
    const h = (await u.session.http.post("/holdings", RD)).data;
    await u.session.http.post(`/holdings/${h._id}/deposit`, { account: account._id, amount: 1000 });

    const res = await u.session.http.post(`/holdings/${h._id}/unadopt`, {});
    expect(res.data.restored).toBe(0);
    const after = (await u.session.http.get("/holdings")).data.find((x: any) => x._id === h._id);
    expect(after.value).toBe(1000);
  });
});

describe("deposit instalments — the goal a recurring deposit already is", () => {
  /** An RD with a schedule, optionally tracked as a goal. */
  async function rdWithTerm(u: any, account: any, trackAsGoal?: boolean) {
    return (
      await u.session.http.post("/holdings", {
        ...RD,
        termCount: 12,
        instalment: {
          amount: 1000,
          account: account._id,
          startDate: isoDay(7),
          frequency: "monthly",
          interval: 1,
        },
        ...(trackAsGoal === undefined ? {} : { trackAsGoal }),
      })
    ).data;
  }

  it("takes its target and deadline from the deposit, not from the user again", async () => {
    const { u, account } = await setup();
    const h = await rdWithTerm(u, account, true);
    expect(h.trackedAsGoal).toBe(true);

    const goals = (await u.session.http.get("/goals")).data;
    expect(goals).toHaveLength(1);
    // Twelve instalments of ₹1,000 — interest deliberately excluded, because the
    // goal is what you set out to put in.
    expect(goals[0]).toMatchObject({ name: "Car Insurance RD", targetAmount: 12000 });
    expect(String(goals[0].linkedHolding?._id ?? goals[0].linkedHolding)).toBe(h._id);
    // The deadline is the last instalment, eleven months after the first.
    const expected = new Date(isoDay(7));
    expected.setMonth(expected.getMonth() + 11);
    expect(String(goals[0].targetDate).slice(0, 10)).toBe(expected.toISOString().slice(0, 10));
  });

  it("moves with the deposit rather than keeping its own copy", async () => {
    const { u, account } = await setup();
    const h = await rdWithTerm(u, account, true);
    expect((await u.session.http.get("/goals")).data[0].savedAmount).toBe(0);

    await u.session.http.post(`/holdings/${h._id}/deposit`, { account: account._id, amount: 1000 });
    expect((await u.session.http.get("/goals")).data[0].savedAmount).toBe(1000);

    // And back down again, exactly as a wallet-tracked goal does.
    await u.session.http.post(`/holdings/${h._id}/withdraw`, { account: account._id, amount: 400 });
    expect((await u.session.http.get("/goals")).data[0].savedAmount).toBe(600);
  });

  it("refuses a contribution, because the deposit is what moves it", async () => {
    const { u, account } = await setup();
    await rdWithTerm(u, account, true);
    const goal = (await u.session.http.get("/goals")).data[0];

    // Recording here as well would show the same rupees twice.
    const res = await u.session.http.post(`/goals/${goal._id}/contribute`, { amount: 500 });
    expect(res.status).toBe(400);
    expect(res.data.code).toBe("GOAL_TRACKS_DEPOSIT");
    expect((await u.session.http.get("/goals")).data[0].savedAmount).toBe(0);
  });

  it("is a choice — no goal appears unless one is asked for", async () => {
    const { u, account } = await setup();
    await rdWithTerm(u, account, false);
    expect((await u.session.http.get("/goals")).data).toHaveLength(0);

    // Omitting it entirely is the same as declining: a standing order into a
    // savings pot is a habit, not something anyone set as a goal.
    const { u: u2, account: a2 } = await setup();
    await rdWithTerm(u2, a2);
    expect((await u2.session.http.get("/goals")).data).toHaveLength(0);
  });

  it("can be switched on and off later without disturbing the deposit", async () => {
    const { u, account } = await setup();
    const h = await rdWithTerm(u, account, false);
    await u.session.http.post(`/holdings/${h._id}/deposit`, { account: account._id, amount: 1000 });

    const on = await u.session.http.patch(`/holdings/${h._id}`, { trackAsGoal: true });
    expect(on.data.trackedAsGoal).toBe(true);
    // It arrives already showing the instalment that was paid before it existed.
    expect((await u.session.http.get("/goals")).data[0].savedAmount).toBe(1000);

    const off = await u.session.http.patch(`/holdings/${h._id}`, { trackAsGoal: false });
    expect(off.data.trackedAsGoal).toBe(false);
    expect((await u.session.http.get("/goals")).data).toHaveLength(0);
    // The deposit itself is untouched by either.
    const after = (await u.session.http.get("/holdings")).data.find((x: any) => x._id === h._id);
    expect(after.value).toBe(1000);
    expect(after.instalment).toBeTruthy();
  });

  it("follows a rename, and doesn't vanish on an unrelated edit", async () => {
    const { u, account } = await setup();
    const h = await rdWithTerm(u, account, true);

    await u.session.http.patch(`/holdings/${h._id}`, { name: "Car Insurance" });
    const goals = (await u.session.http.get("/goals")).data;
    expect(goals).toHaveLength(1); // a rename must not silently delete it
    expect(goals[0].name).toBe("Car Insurance");
  });

  it("goes when the deposit goes", async () => {
    const { u, account } = await setup();
    const h = await rdWithTerm(u, account, true);

    await u.session.http.delete(`/holdings/${h._id}`);
    // A goal whose progress can never move again would sit at whatever figure it
    // reached, for ever.
    expect((await u.session.http.get("/goals")).data).toHaveLength(0);
  });
});

describe("deposit instalments — the goal knows what pays it", () => {
  it("counts the deposit's own instalment as the goal's funding", async () => {
    const { u, account } = await setup();
    const h = (
      await u.session.http.post("/holdings", {
        ...RD,
        termCount: 12,
        trackAsGoal: true,
        instalment: {
          amount: 1000,
          account: account._id,
          startDate: isoDay(7),
          frequency: "monthly",
          interval: 1,
        },
      })
    ).data;
    expect(h.trackedAsGoal).toBe(true);

    const goal = (await u.session.http.get("/goals")).data[0];
    // "Nothing paying in yet" would be untrue of a goal being paid into monthly.
    expect(goal.fundedByRules).toBe(1);
    expect(goal.fundedMonthly).toBe(1000);
    // And with a rate of ₹1,000 a month against ₹12,000, it lands on time.
    expect(goal.projectedDate).toBeTruthy();
  });

  it("doesn't call a deposit that's running to plan 'behind'", async () => {
    const { u, account } = await setup();
    // The first instalment is a week out, so dividing what's left by a monthly
    // rate from today lands a month past the deadline — and the card used to
    // report that as being behind schedule, about a deposit doing exactly what
    // it agreed to.
    await u.session.http.post("/holdings", {
      ...RD,
      termCount: 12,
      trackAsGoal: true,
      instalment: {
        amount: 1000,
        account: account._id,
        startDate: isoDay(7),
        frequency: "monthly",
        interval: 1,
      },
    });

    const goal = (await u.session.http.get("/goals")).data[0];
    expect(goal.schedule).not.toBe("behind");
    // It finishes on its last instalment, because that is what the plan says.
    expect(String(goal.projectedDate).slice(0, 10)).toBe(String(goal.targetDate).slice(0, 10));
  });
});

describe("deposit instalments — linking a goal somebody already had", () => {
  /** A goal built by hand, the way people ran an RD before deposits held one. */
  async function handBuiltGoal(u: any) {
    return (
      await u.session.http.post("/goals", {
        name: "Car insurance",
        targetAmount: 12000,
        savedAmount: 3000,
        targetDate: isoDay(300),
      })
    ).data;
  }

  it("hands the arithmetic over without making them start again", async () => {
    const { u, account } = await setup();
    const goal = await handBuiltGoal(u);
    const h = (
      await u.session.http.post("/holdings", {
        ...RD,
        termCount: 12,
        instalment: { amount: 1000, account: account._id, startDate: isoDay(7) },
      })
    ).data;
    await u.session.http.post(`/holdings/${h._id}/deposit`, { account: account._id, amount: 1000 });

    const res = await u.session.http.patch(`/goals/${goal._id}`, { linkedHolding: h._id });
    expect(res.status).toBe(200);
    // Progress is the deposit's, not the figure they had typed.
    expect(res.data.savedAmount).toBe(1000);
    // What they wrote is still theirs: linking is not a takeover.
    expect(res.data.name).toBe("Car insurance");
    expect(res.data.targetAmount).toBe(12000);
    // And the deposit now knows it's tracked, so it won't offer a second goal.
    const holding = (await u.session.http.get("/holdings")).data.find((x: any) => x._id === h._id);
    expect(holding.trackedAsGoal).toBe(true);
  });

  it("won't let two goals read one deposit", async () => {
    const { u, account } = await setup();
    const h = (
      await u.session.http.post("/holdings", {
        ...RD,
        termCount: 12,
        trackAsGoal: true,
        instalment: { amount: 1000, account: account._id, startDate: isoDay(7) },
      })
    ).data;
    const second = await handBuiltGoal(u);

    const res = await u.session.http.patch(`/goals/${second._id}`, { linkedHolding: h._id });
    expect(res.status).toBe(409);
    expect(res.data.code).toBe("HOLDING_ALREADY_LINKED");
  });

  it("won't let one goal read a wallet and a deposit at once", async () => {
    const { u, account } = await setup();
    const h = (await u.session.http.post("/holdings", RD)).data;
    const goal = (
      await u.session.http.post("/goals", {
        name: "Car insurance",
        targetAmount: 12000,
        linkedAccount: account._id,
      })
    ).data;

    // Two sources would be two answers to the question the goal exists to answer.
    const res = await u.session.http.patch(`/goals/${goal._id}`, { linkedHolding: h._id });
    expect(res.status).toBe(400);
    expect(res.data.code).toBe("GOAL_TWO_LINKS");
  });

  it("refuses a holding valued from its lots", async () => {
    const { u } = await setup();
    const stocks = (
      await u.session.http.post("/holdings", {
        name: "Demat",
        class: "investment",
        subtype: "stocks",
        value: 50000,
      })
    ).data;
    const goal = await handBuiltGoal(u);

    // Reading one would be reading a market price, not money set aside.
    const res = await u.session.http.patch(`/goals/${goal._id}`, { linkedHolding: stocks._id });
    expect(res.status).toBe(400);
    expect(res.data.code).toBe("HOLDING_LOT_OWNED");
  });

  it("gives a hand-linked goal back rather than deleting it", async () => {
    const { u, account } = await setup();
    const goal = await handBuiltGoal(u);
    const h = (
      await u.session.http.post("/holdings", {
        ...RD,
        termCount: 12,
        instalment: { amount: 1000, account: account._id, startDate: isoDay(7) },
      })
    ).data;
    await u.session.http.post(`/holdings/${h._id}/deposit`, { account: account._id, amount: 1000 });
    await u.session.http.patch(`/goals/${goal._id}`, { linkedHolding: h._id });

    // Switching the deposit's toggle off must not delete a goal the user made.
    await u.session.http.patch(`/holdings/${h._id}`, { trackAsGoal: false });
    const after = (await u.session.http.get("/goals")).data;
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ name: "Car insurance", targetAmount: 12000 });
    expect(after[0].linkedHolding ?? null).toBeNull();
    // It keeps the figure it had reached, rather than snapping back to 3,000.
    expect(after[0].savedAmount).toBe(1000);
  });

  it("survives the deposit being deleted, unlike the deposit's own goal", async () => {
    const { u, account } = await setup();
    const mine = await handBuiltGoal(u);
    const h = (
      await u.session.http.post("/holdings", {
        ...RD,
        termCount: 12,
        instalment: { amount: 1000, account: account._id, startDate: isoDay(7) },
      })
    ).data;
    await u.session.http.post(`/holdings/${h._id}/deposit`, { account: account._id, amount: 1000 });
    await u.session.http.patch(`/goals/${mine._id}`, { linkedHolding: h._id });

    await u.session.http.delete(`/holdings/${h._id}`);
    const after = (await u.session.http.get("/goals")).data;
    expect(after).toHaveLength(1);
    expect(after[0].savedAmount).toBe(1000);
    // And it takes contributions again, now that nothing else moves it.
    const contributed = await u.session.http.post(`/goals/${after[0]._id}/contribute`, {
      amount: 500,
    });
    expect(contributed.status).toBe(200);
    expect(contributed.data.savedAmount).toBe(1500);
  });

  it("doesn't rewrite a hand-made goal when the deposit is renamed", async () => {
    const { u, account } = await setup();
    const goal = await handBuiltGoal(u);
    const h = (
      await u.session.http.post("/holdings", {
        ...RD,
        termCount: 12,
        instalment: { amount: 1000, account: account._id, startDate: isoDay(7) },
      })
    ).data;
    await u.session.http.patch(`/goals/${goal._id}`, { linkedHolding: h._id });

    await u.session.http.patch(`/holdings/${h._id}`, { name: "HDFC RD" });
    const after = (await u.session.http.get("/goals")).data[0];
    // The deposit's own goal follows its name; one the user wrote does not.
    expect(after.name).toBe("Car insurance");
    expect(after.targetAmount).toBe(12000);
  });
});
