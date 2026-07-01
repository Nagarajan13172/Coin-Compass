import { describe, it, expect } from "vitest";
import { prepaymentCharge, splitPayment, monthlyInterest } from "./loanService";

describe("loanService.prepaymentCharge", () => {
  it("is zero when the charge rate is 0 (home/personal/education loans)", () => {
    expect(prepaymentCharge(100000, 0)).toBe(0);
    expect(prepaymentCharge(500000, 0)).toBe(0);
  });

  it("computes base × pct%, rounded to the rupee", () => {
    expect(prepaymentCharge(100000, 5)).toBe(5000); // car loan @ 5%
    expect(prepaymentCharge(100000, 4)).toBe(4000); // business loan @ 4%
    expect(prepaymentCharge(100000, 1)).toBe(1000); // gold loan @ 1%
    expect(prepaymentCharge(250000, 2)).toBe(5000);
  });

  it("rounds to the nearest rupee (no fractional paise)", () => {
    // 33333 * 2% = 666.66 -> 667
    expect(prepaymentCharge(33333, 2)).toBe(667);
    // 12345 * 1.5% = 185.175 -> 185
    expect(prepaymentCharge(12345, 1.5)).toBe(185);
  });

  it("is zero on a zero base regardless of rate", () => {
    expect(prepaymentCharge(0, 5)).toBe(0);
  });

  it("clamps negative inputs to zero (defensive)", () => {
    expect(prepaymentCharge(-100000, 5)).toBe(0);
    expect(prepaymentCharge(100000, -5)).toBe(0);
  });

  it("matches how part-payment records the fee (charge on the prepaid principal)", () => {
    // Part payment of 100000 on a car loan (5%): recorded charge = 5000.
    const outstanding = 400000;
    const amount = 100000;
    const principal = Math.min(amount, outstanding);
    expect(prepaymentCharge(principal, 5)).toBe(5000);
  });

  it("matches how preclose records the fee (charge on full outstanding)", () => {
    // Preclose a car loan with 250000 outstanding @ 5% = 12500.
    expect(prepaymentCharge(250000, 5)).toBe(12500);
  });
});

describe("loanService.splitPayment", () => {
  it("splits an EMI into interest-first, then principal (reducing balance)", () => {
    // 1,00,000 @ 12% p.a. -> 1% monthly interest = 1000. EMI 10000 -> 9000 principal.
    const { interest, principal } = splitPayment(100000, 12, 10000);
    expect(interest).toBe(1000);
    expect(principal).toBe(9000);
  });

  it("a small payment can be entirely interest", () => {
    const { interest, principal } = splitPayment(100000, 12, 500);
    expect(interest).toBe(500);
    expect(principal).toBe(0);
  });

  it("never pays down more principal than is outstanding", () => {
    const { principal } = splitPayment(5000, 12, 100000);
    expect(principal).toBeLessThanOrEqual(5000);
  });

  it("monthlyInterest is outstanding × monthly rate", () => {
    expect(monthlyInterest(120000, 10)).toBeCloseTo(1000, 6); // 120000 * (10/12/100)
  });
});
