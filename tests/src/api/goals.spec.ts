import { describe, it, expect } from "vitest";
import { createVerifiedUser } from "../harness/users";

describe("Goals — CRUD", () => {
  it("creates a goal (201) with progress fields", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.post("/goals", { name: "Vacation", targetAmount: 1000 });
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ name: "Vacation", targetAmount: 1000, savedAmount: 0 });
    expect(res.data).toMatchObject({ remaining: 1000, percent: 0, complete: false });
  });

  it("lists goals", async () => {
    const u = await createVerifiedUser();
    await u.session.http.post("/goals", { name: "G", targetAmount: 100 });
    const res = await u.session.http.get("/goals");
    expect(res.status).toBe(200);
    expect(res.data.length).toBeGreaterThanOrEqual(1);
  });

  it("updates a goal", async () => {
    const u = await createVerifiedUser();
    const g = (await u.session.http.post("/goals", { name: "Old", targetAmount: 100 })).data;
    const res = await u.session.http.patch(`/goals/${g._id}`, { name: "New", targetAmount: 250 });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ name: "New", targetAmount: 250 });
  });

  it("deletes a goal", async () => {
    const u = await createVerifiedUser();
    const g = (await u.session.http.post("/goals", { name: "Temp", targetAmount: 100 })).data;
    expect((await u.session.http.delete(`/goals/${g._id}`)).status).toBe(200);
    expect((await u.session.http.delete(`/goals/${g._id}`)).status).toBe(404);
  });
});

describe("Goals — contributions", () => {
  it("adds a contribution and tracks progress", async () => {
    const u = await createVerifiedUser();
    const g = (await u.session.http.post("/goals", { name: "Car", targetAmount: 1000 })).data;
    const res = await u.session.http.post(`/goals/${g._id}/contribute`, { amount: 400 });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ savedAmount: 400, percent: 40, complete: false });
  });

  it("marks the goal complete when saved reaches the target", async () => {
    const u = await createVerifiedUser();
    const g = (await u.session.http.post("/goals", { name: "Phone", targetAmount: 500 })).data;
    const res = await u.session.http.post(`/goals/${g._id}/contribute`, { amount: 500 });
    expect(res.data).toMatchObject({ complete: true, percent: 100 });
  });

  it("clamps saved to zero on an over-withdrawal", async () => {
    const u = await createVerifiedUser();
    const g = (await u.session.http.post("/goals", { name: "X", targetAmount: 1000, savedAmount: 100 })).data;
    const res = await u.session.http.post(`/goals/${g._id}/contribute`, { amount: -500 });
    expect(res.data.savedAmount).toBe(0);
  });
});

describe("Goals — validation & ownership", () => {
  it("rejects a non-positive target with 400", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/goals", { name: "Bad", targetAmount: 0 })).status).toBe(400);
  });

  it("rejects a blank name with 400", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/goals", { name: "", targetAmount: 100 })).status).toBe(400);
  });

  it("404s for another user's goal", async () => {
    const owner = await createVerifiedUser();
    const g = (await owner.session.http.post("/goals", { name: "Mine", targetAmount: 100 })).data;
    const stranger = await createVerifiedUser();
    expect((await stranger.session.http.post(`/goals/${g._id}/contribute`, { amount: 10 })).status).toBe(404);
    expect((await stranger.session.http.delete(`/goals/${g._id}`)).status).toBe(404);
  });
});

/**
 * A goal can track a wallet instead of counting contributions: progress is then
 * that account's live balance, so paying in — by salary transfer, a recurring
 * rule, or an ad-hoc top-up — moves the goal with nothing recorded on the goal
 * itself. The rules below exist to stop the same rupee being counted twice.
 */
describe("Goals — linked to an account", () => {
  /** A user with a dedicated wallet, ready to be linked. */
  async function withWallet(initialBalance = 0) {
    const u = await createVerifiedUser();
    const wallet = (await u.session.http.post("/accounts", { name: "Emergency Wallet", initialBalance })).data;
    const main = (await u.session.http.post("/accounts", { name: "Main", initialBalance: 100000 })).data;
    return { u, wallet, main };
  }

  it("reports the wallet's balance as progress, opening balance included", async () => {
    const { u, wallet } = await withWallet(40000);
    const goal = (
      await u.session.http.post("/goals", {
        name: "Emergency Fund",
        targetAmount: 500000,
        linkedAccount: wallet._id,
      })
    ).data;
    expect(goal).toMatchObject({ savedAmount: 40000, remaining: 460000, percent: 8 });
  });

  it("advances on a transfer in and falls back on a withdrawal", async () => {
    const { u, wallet, main } = await withWallet();
    const goal = (
      await u.session.http.post("/goals", { name: "Emergency Fund", targetAmount: 100000, linkedAccount: wallet._id })
    ).data;

    // The monthly ₹15,000, then an ad-hoc ₹3,000 of leftover cash.
    await u.session.http.post("/transactions", { type: "transfer", amount: 15000, account: main._id, toAccount: wallet._id });
    await u.session.http.post("/transactions", { type: "transfer", amount: 3000, account: main._id, toAccount: wallet._id });
    let listed = (await u.session.http.get("/goals")).data.find((g: { _id: string }) => g._id === goal._id);
    expect(listed).toMatchObject({ savedAmount: 18000, percent: 18 });

    // Taking money back out moves the goal down again — no bookkeeping either way.
    await u.session.http.post("/transactions", { type: "transfer", amount: 5000, account: wallet._id, toAccount: main._id });
    listed = (await u.session.http.get("/goals")).data.find((g: { _id: string }) => g._id === goal._id);
    expect(listed.savedAmount).toBe(13000);
  });

  it("completes when the wallet reaches the target", async () => {
    const { u, wallet, main } = await withWallet();
    await u.session.http.post("/goals", { name: "Insurance", targetAmount: 12000, linkedAccount: wallet._id });
    await u.session.http.post("/transactions", { type: "transfer", amount: 12000, account: main._id, toAccount: wallet._id });
    const [g] = (await u.session.http.get("/goals")).data;
    expect(g).toMatchObject({ savedAmount: 12000, remaining: 0, percent: 100, complete: true });
  });

  it("refuses a second goal on the same wallet", async () => {
    const { u, wallet } = await withWallet();
    expect((await u.session.http.post("/goals", { name: "First", targetAmount: 1000, linkedAccount: wallet._id })).status).toBe(201);
    const res = await u.session.http.post("/goals", { name: "Second", targetAmount: 2000, linkedAccount: wallet._id });
    expect(res.status).toBe(409);
    expect(res.data.code).toBe("ACCOUNT_ALREADY_LINKED");
  });

  it("refuses another user's account, and a missing one", async () => {
    const { wallet } = await withWallet();
    const other = await createVerifiedUser();
    const res = await other.session.http.post("/goals", { name: "Sneaky", targetAmount: 100, linkedAccount: wallet._id });
    expect(res.status).toBe(404);
  });

  it("refuses a manual contribution — the money belongs in the wallet", async () => {
    const { u, wallet } = await withWallet(1000);
    const goal = (
      await u.session.http.post("/goals", { name: "Fund", targetAmount: 5000, linkedAccount: wallet._id })
    ).data;
    const res = await u.session.http.post(`/goals/${goal._id}/contribute`, { amount: 500 });
    expect(res.status).toBe(400);
    expect(res.data.code).toBe("GOAL_TRACKS_ACCOUNT");
    // And nothing moved.
    const [listed] = (await u.session.http.get("/goals")).data;
    expect(listed.savedAmount).toBe(1000);
  });

  it("refuses a transaction or a recurring rule pointed at it", async () => {
    const { u, wallet, main } = await withWallet();
    const goal = (
      await u.session.http.post("/goals", { name: "Fund", targetAmount: 5000, linkedAccount: wallet._id })
    ).data;

    const txn = await u.session.http.post("/transactions", {
      type: "expense",
      amount: 500,
      account: main._id,
      goal: goal._id,
    });
    expect(txn.status).toBe(400);
    expect(txn.data.code).toBe("GOAL_TRACKS_ACCOUNT");

    const rule = await u.session.http.post("/recurring", {
      type: "expense",
      amount: 1000,
      account: main._id,
      goal: goal._id,
      frequency: "monthly",
      interval: 1,
      startDate: new Date().toISOString(),
    });
    expect(rule.status).toBe(400);
    expect(rule.data.code).toBe("GOAL_TRACKS_ACCOUNT");
  });

  it("ignores contributions stored before the goal was linked", async () => {
    // A rule pointed at the goal first, then the goal starts tracking a wallet:
    // its posted amounts must not be added on top of the balance.
    const { u, wallet, main } = await withWallet();
    const goal = (await u.session.http.post("/goals", { name: "Fund", targetAmount: 50000 })).data;
    await u.session.http.post(`/goals/${goal._id}/contribute`, { amount: 7000 });

    expect((await u.session.http.patch(`/goals/${goal._id}`, { linkedAccount: wallet._id })).status).toBe(200);
    await u.session.http.post("/transactions", { type: "transfer", amount: 2000, account: main._id, toAccount: wallet._id });

    const [listed] = (await u.session.http.get("/goals")).data;
    expect(listed.savedAmount).toBe(2000); // the wallet, not 9,000
  });

  it("keeps the figure on unlink, and when the wallet is deleted", async () => {
    const { u, wallet, main } = await withWallet();
    const goal = (
      await u.session.http.post("/goals", { name: "Fund", targetAmount: 50000, linkedAccount: wallet._id })
    ).data;
    await u.session.http.post("/transactions", { type: "transfer", amount: 8000, account: main._id, toAccount: wallet._id });

    // Unlinking freezes what the user last saw as the goal's own total.
    expect((await u.session.http.patch(`/goals/${goal._id}`, { linkedAccount: null })).status).toBe(200);
    let [listed] = (await u.session.http.get("/goals")).data;
    expect(listed).toMatchObject({ savedAmount: 8000, linkedAccount: null });

    // Same when the account is deleted out from under a linked goal.
    await u.session.http.patch(`/goals/${goal._id}`, { linkedAccount: wallet._id });
    expect((await u.session.http.delete(`/accounts/${wallet._id}?force=true`)).status).toBe(200);
    [listed] = (await u.session.http.get("/goals")).data;
    expect(listed.linkedAccount).toBeNull();
    expect(listed.savedAmount).toBe(8000);
  });
});
