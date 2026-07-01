import { describe, it, expect } from "vitest";
import { prepaymentCharge, computePayoff, LOAN_TYPE_META } from "./networth";
import type { LoanType } from "./types";

/**
 * Mirrors what the loan dialogs do: a new loan is seeded with its type's typical
 * charge %, and a part-payment / prepayment fee is that % of the prepaid
 * principal (capped at the outstanding balance). Preclose charges the full
 * outstanding. These compose the real exported helpers, so they validate the
 * same logic the Part-payment, Preclose and Payoff-planner dialogs run.
 */
function partPaymentCharge(type: LoanType, amount: number, outstanding: number) {
  const rate = LOAN_TYPE_META[type].typicalChargePct;
  const principal = Math.min(amount, outstanding);
  return prepaymentCharge(principal, rate);
}
function precloseCharge(type: LoanType, outstanding: number) {
  return prepaymentCharge(outstanding, LOAN_TYPE_META[type].typicalChargePct);
}

describe("prepaymentCharge", () => {
  it("is 0 when the rate is 0", () => {
    expect(prepaymentCharge(100000, 0)).toBe(0);
    expect(prepaymentCharge(0, 5)).toBe(0);
  });

  it("computes base × pct%, rounded to the rupee", () => {
    expect(prepaymentCharge(100000, 5)).toBe(5000);
    expect(prepaymentCharge(33333, 2)).toBe(667); // 666.66 -> 667
    expect(prepaymentCharge(12345, 1.5)).toBe(185); // 185.175 -> 185
  });

  it("clamps negative inputs to 0 (defensive)", () => {
    expect(prepaymentCharge(-100000, 5)).toBe(0);
    expect(prepaymentCharge(100000, -5)).toBe(0);
  });
});

describe("LOAN_TYPE_META typical charges (RBI 2025 defaults)", () => {
  it("home, personal & education loans default to 0% (floating-rate individual loans are exempt)", () => {
    expect(LOAN_TYPE_META.home.typicalChargePct).toBe(0);
    expect(LOAN_TYPE_META.personal.typicalChargePct).toBe(0);
    expect(LOAN_TYPE_META.education.typicalChargePct).toBe(0);
  });

  it("car, business & gold loans default to a realistic non-zero charge", () => {
    expect(LOAN_TYPE_META.car.typicalChargePct).toBe(5);
    expect(LOAN_TYPE_META.business.typicalChargePct).toBe(4);
    expect(LOAN_TYPE_META.gold.typicalChargePct).toBe(1);
    expect(LOAN_TYPE_META.other.typicalChargePct).toBe(2);
  });

  it("every loan type has a valid charge in the 0–100 range", () => {
    for (const meta of Object.values(LOAN_TYPE_META)) {
      expect(meta.typicalChargePct).toBeGreaterThanOrEqual(0);
      expect(meta.typicalChargePct).toBeLessThanOrEqual(100);
    }
  });
});

describe("part-payment / prepayment charge by loan type", () => {
  it("HOME loan: a ₹1,00,000 part payment incurs NO charge", () => {
    expect(partPaymentCharge("home", 100000, 3000000)).toBe(0);
  });

  it("PERSONAL loan: a ₹1,00,000 part payment incurs NO charge", () => {
    expect(partPaymentCharge("personal", 100000, 500000)).toBe(0);
  });

  it("CAR loan: a ₹1,00,000 part payment incurs a 5% = ₹5,000 charge", () => {
    expect(partPaymentCharge("car", 100000, 400000)).toBe(5000);
  });

  it("CAR loan: preclosing ₹2,50,000 outstanding incurs 5% = ₹12,500", () => {
    expect(precloseCharge("car", 250000)).toBe(12500);
  });

  it("caps the charge base at the outstanding balance (over-payment isn't over-charged)", () => {
    // Paying 500000 toward a 300000 car loan -> charge is on 300000, not 500000.
    expect(partPaymentCharge("car", 500000, 300000)).toBe(15000);
  });

  it("a user-overridden rate takes precedence over the type default", () => {
    // e.g. a fixed-rate personal loan the user knows charges 3%.
    const principal = Math.min(100000, 500000);
    expect(prepaymentCharge(principal, 3)).toBe(3000);
  });
});

describe("payoff planner: net benefit after charge", () => {
  it("a large early lump on a car loan saves more interest than the 5% charge (worth it)", () => {
    const base = computePayoff(300000, 10, 10000);
    const boosted = computePayoff(300000 - 100000, 10, 10000);
    const interestSaved = Math.max(0, base.totalInterest - boosted.totalInterest);
    const charge = prepaymentCharge(100000, LOAN_TYPE_META.car.typicalChargePct); // 5000
    const netSaved = interestSaved - charge;

    expect(interestSaved).toBeGreaterThan(charge);
    expect(netSaved).toBeGreaterThan(0);
  });

  it("a home loan lump keeps the full interest saved (0% charge -> net === interest saved)", () => {
    const base = computePayoff(3000000, 8, 25000);
    const boosted = computePayoff(3000000 - 200000, 8, 25000);
    const interestSaved = Math.max(0, base.totalInterest - boosted.totalInterest);
    const charge = prepaymentCharge(200000, LOAN_TYPE_META.home.typicalChargePct); // 0
    expect(charge).toBe(0);
    expect(interestSaved - charge).toBe(interestSaved);
  });

  it("net benefit = interest saved − charge, and a charge that outweighs savings is flagged", () => {
    // The planner shows an amber "not worth it" warning when charge > 0 && net <= 0.
    const notWorth = (interestSaved: number, charge: number) => charge > 0 && interestSaved - charge <= 0;
    expect(6000 - prepaymentCharge(100000, 5)).toBe(1000); // 6000 - 5000, worth it
    expect(notWorth(6000, prepaymentCharge(100000, 5))).toBe(false);
    expect(notWorth(5000, prepaymentCharge(100000, 5))).toBe(true); // break-even -> flagged
    expect(notWorth(3000, prepaymentCharge(100000, 5))).toBe(true); // net -2000 -> flagged
    expect(notWorth(10000, 0)).toBe(false); // 0% charge is never "not worth it"
  });
});
