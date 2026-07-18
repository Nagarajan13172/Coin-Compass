import { describe, it, expect } from "vitest";
import { splitRepayment } from "./creditService";

/**
 * splitRepayment is THE rule, isolated: a repayment neutralizes what the person
 * owes you, and only money BEYOND that is real income. These lock the exact cash
 * flows we discussed (exact / partial / across-months / overpayment / gift).
 */
describe("splitRepayment — the neutralize rule", () => {
  it("exact repayment neutralizes fully, no income (owed 20k, pay 20k)", () => {
    expect(splitRepayment(20000, 20000)).toEqual({ neutral: 20000, income: 0 });
  });

  it("partial repayment neutralizes the part paid, no income (owed 20k, pay 9k)", () => {
    expect(splitRepayment(20000, 9000)).toEqual({ neutral: 9000, income: 0 });
  });

  it("the remaining installment (next month) is still neutralized, NOT income (owed 5k, pay 5k)", () => {
    // After paying 15k of 20k, 5k is owed; the final 5k clears it — never income.
    expect(splitRepayment(5000, 5000)).toEqual({ neutral: 5000, income: 0 });
  });

  it("overpayment splits: dues neutralize, the excess is income (owed 20k, pay 22k)", () => {
    expect(splitRepayment(20000, 22000)).toEqual({ neutral: 20000, income: 2000 });
  });

  it("money received with nothing owed is pure income — a gift (owed 0, pay 5k)", () => {
    expect(splitRepayment(0, 5000)).toEqual({ neutral: 0, income: 5000 });
  });

  it("when YOU owe them (negative owed), receiving is all income, never negative neutralize", () => {
    expect(splitRepayment(-3000, 5000)).toEqual({ neutral: 0, income: 5000 });
  });

  it("never neutralizes more than what was received", () => {
    expect(splitRepayment(20000, 8000)).toEqual({ neutral: 8000, income: 0 });
  });
});
