import { describe, it, expect } from "vitest";
import { applyDeposit, splitWithdrawal } from "./depositService";

/**
 * The whole feature rests on one claim: paying into a deposit moves money, it
 * doesn't destroy it. These guard the arithmetic that has to hold for that to be
 * true — principal in equals principal out, and nothing leaks at the edges.
 */
describe("depositService.applyDeposit", () => {
  const rd = (value: number, invested: number | null = null) => ({ value, invested });

  it("pays an instalment in, raising both the value and the cost basis", () => {
    const r = applyDeposit(rd(0, 0), 5000);
    expect(r.value).toBe(5000);
    expect(r.invested).toBe(5000);
    expect(r.applied).toBe(5000);
  });

  it("accumulates instalments (12 months of a ₹5,000 RD)", () => {
    let state = rd(0, 0);
    for (let i = 0; i < 12; i += 1) state = applyDeposit(state, 5000);
    expect(state.value).toBe(60000);
    expect(state.invested).toBe(60000);
  });

  it("adopts the existing value as the cost basis when none was recorded", () => {
    // A hand-added FD of ₹1,00,000 with no investedAmount: the first ledger
    // deposit has to start counting from what is already there, not from zero.
    const r = applyDeposit(rd(100000, null), 5000);
    expect(r.invested).toBe(105000);
    expect(r.value).toBe(105000);
  });

  it("takes money back out, reducing both figures", () => {
    const r = applyDeposit(rd(60000, 60000), -20000);
    expect(r.value).toBe(40000);
    expect(r.invested).toBe(40000);
    expect(r.applied).toBe(-20000);
  });

  it("never lets a deposit go negative, and reports only what it could apply", () => {
    // The caller stores `applied`, so a delete of this leg puts back 60000 —
    // not the 75000 that was asked for and never happened.
    const r = applyDeposit(rd(60000, 60000), -75000);
    expect(r.value).toBe(0);
    expect(r.applied).toBe(-60000);
    expect(r.invested).toBe(0);
  });

  it("is exactly reversible: apply then reverse `applied` returns the original", () => {
    const before = rd(37500.5, 37500.5);
    const after = applyDeposit(before, 4999.99);
    const back = applyDeposit(after, -after.applied);
    expect(back.value).toBe(before.value);
    expect(back.invested).toBe(before.invested);
  });

  it("rounds to paise rather than accumulating float drift", () => {
    let state = rd(0, 0);
    for (let i = 0; i < 3; i += 1) state = applyDeposit(state, 0.1);
    expect(state.value).toBe(0.3);
  });

  it("treats a negative stored value as zero rather than deepening it", () => {
    const r = applyDeposit(rd(-500, null), 1000);
    expect(r.value).toBe(1000);
    expect(r.applied).toBe(1000);
  });
});

describe("depositService.splitWithdrawal", () => {
  it("splits a matured RD payout into returned principal and earned interest", () => {
    expect(splitWithdrawal(60000, 62000)).toEqual({ principal: 60000, interest: 2000 });
  });

  it("treats a partial withdrawal within the principal as pure capital", () => {
    // Net worth must not move here — no income leg should be posted.
    expect(splitWithdrawal(60000, 20000)).toEqual({ principal: 20000, interest: 0 });
  });

  it("books the whole payout as interest once the principal is exhausted", () => {
    expect(splitWithdrawal(0, 1500)).toEqual({ principal: 0, interest: 1500 });
  });

  it("splits exactly at the principal boundary", () => {
    expect(splitWithdrawal(60000, 60000)).toEqual({ principal: 60000, interest: 0 });
  });

  it("never returns negative legs for a nonsensical request", () => {
    expect(splitWithdrawal(-100, -50)).toEqual({ principal: 0, interest: 0 });
  });

  it("keeps principal + interest equal to the cash actually received", () => {
    const { principal, interest } = splitWithdrawal(12345.67, 13000.01);
    expect(principal + interest).toBeCloseTo(13000.01, 2);
  });
});
