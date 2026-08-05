import { describe, it, expect } from "vitest";
import { settleOwed, splitRepayment, directionSign, isReceivableSide } from "./creditService";

/**
 * settleOwed is the MIRROR of splitRepayment: paying someone back clears what you
 * owe them, and only money BEYOND that is real spending.
 *
 * Getting this wrong double-counts. When a friend buys your dinner the expense is
 * recorded THEN; if handing over the cash later were also an expense, one ₹500
 * meal would show as ₹1,000 of spending.
 */
describe("settleOwed — paying someone back is not spending", () => {
  it("paying exactly what you owe clears it, with no expense", () => {
    expect(settleOwed(500, 500)).toEqual({ neutral: 500, expense: 0 });
  });

  it("a part payment clears part of it, still no expense", () => {
    expect(settleOwed(500, 200)).toEqual({ neutral: 200, expense: 0 });
  });

  it("the remainder later is still just clearing, never new spending", () => {
    expect(settleOwed(300, 300)).toEqual({ neutral: 300, expense: 0 });
  });

  it("paying MORE than you owe splits: dues clear, the excess is a gift", () => {
    expect(settleOwed(500, 700)).toEqual({ neutral: 500, expense: 200 });
  });

  it("paying with nothing owed is pure spending — a gift", () => {
    expect(settleOwed(0, 500)).toEqual({ neutral: 0, expense: 500 });
  });

  it("when THEY owe you (negative owed), paying is all a gift, never negative clearing", () => {
    expect(settleOwed(-3000, 500)).toEqual({ neutral: 0, expense: 500 });
  });

  it("never clears more than was actually paid", () => {
    expect(settleOwed(5000, 800)).toEqual({ neutral: 800, expense: 0 });
  });

  it("is the exact mirror of splitRepayment for the same numbers", () => {
    // Same shape, opposite side of the ledger: income there ⇄ expense here.
    for (const [owed, amount] of [
      [20000, 20000],
      [20000, 9000],
      [20000, 22000],
      [0, 5000],
      [-3000, 5000],
    ] as const) {
      const lent = splitRepayment(owed, amount);
      const owedSide = settleOwed(owed, amount);
      expect(owedSide.neutral).toBe(lent.neutral);
      expect(owedSide.expense).toBe(lent.income);
    }
  });
});

/**
 * One person, one balance — however the money moved between you. If these signs
 * were wrong, lending someone ₹500 and borrowing ₹500 from them would show as
 * ₹1,000 rather than settling out to zero.
 */
describe("directionSign — a single net per person", () => {
  it("counts money you put out as owed TO you", () => {
    expect(directionSign("given")).toBe(1); // you lent them
    expect(directionSign("repaid")).toBe(1); // you cleared a debt of yours
  });

  it("counts money coming from them as owed BY you", () => {
    expect(directionSign("received")).toBe(-1); // they paid you back
    expect(directionSign("borrowed")).toBe(-1); // they lent to / paid for you
  });

  it("a lend and an equal borrow cancel out", () => {
    const net = directionSign("given") * 500 + directionSign("borrowed") * 500;
    expect(net).toBe(0);
  });

  it("borrowing then repaying returns to zero", () => {
    const net = directionSign("borrowed") * 500 + directionSign("repaid") * 500;
    expect(net).toBe(0);
  });
});

/**
 * The two buckets are separate real accounts. A repayment must be sized against
 * the side it draws on, or it would pull one of them past zero — the same class
 * of drift the reflected-only rule already guards on the lending side.
 */
describe("isReceivableSide — which bucket a direction touches", () => {
  it("puts lending and being repaid on the Money Lent side", () => {
    expect(isReceivableSide("given")).toBe(true);
    expect(isReceivableSide("received")).toBe(true);
  });

  it("puts borrowing and repaying on the Money Owed side", () => {
    expect(isReceivableSide("borrowed")).toBe(false);
    expect(isReceivableSide("repaid")).toBe(false);
  });
});
