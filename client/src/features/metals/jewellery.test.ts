import { describe, it, expect } from "vitest";
import { GRAMS_PER_SOVEREIGN, GST_PCT, jewelleryCost, toSovereigns, weightRows } from "./jewellery";

/** A round rate, so every expected figure below can be checked by hand. */
const RATE = 7000; // ₹7,000 per gram of 22K

describe("jewellery cost — the parts of the bill", () => {
  it("builds a sovereign of a plain bangle at 12%", () => {
    const c = jewelleryCost(RATE, GRAMS_PER_SOVEREIGN, 12);
    expect(c.metalValue).toBe(56000); // 7,000 × 8
    expect(c.makingCharges).toBe(6720); // 12% of 56,000
    expect(c.gst).toBe(1881.6); // 3% of 62,720
    expect(c.total).toBe(64601.6);
  });

  it("charges GST on the making charges too, not just the metal", () => {
    // The distinction is worth ₹201.60 on one sovereign at 12%, and it compounds.
    const withMaking = jewelleryCost(RATE, 8, 12);
    const metalOnlyGst = 56000 + 6720 + (56000 * GST_PCT) / 100;
    expect(withMaking.total).toBeGreaterThan(metalOnlyGst);
    expect(withMaking.total - metalOnlyGst).toBeCloseTo(201.6, 2);
  });

  it("shows why the same weight costs more as a ring than a bangle", () => {
    const bangle = jewelleryCost(RATE, 8, 12);
    const ring = jewelleryCost(RATE, 8, 20);
    expect(ring.total - bangle.total).toBeCloseTo(4614.4, 2); // 8% of metal, plus its GST
    expect(ring.perGram).toBeGreaterThan(bangle.perGram);
  });

  it("reports the all-in per-gram cost, which is what actually compares", () => {
    const c = jewelleryCost(RATE, 16, 12);
    expect(c.perGram).toBe(8075.2); // well above the ₹7,000 counter rate
    expect(c.perGram).toBeCloseTo(jewelleryCost(RATE, 8, 12).perGram, 2); // weight-independent
  });

  it("handles zero making charges — some jewellers waive them on bullion", () => {
    const c = jewelleryCost(RATE, 10, 0);
    expect(c.makingCharges).toBe(0);
    expect(c.gst).toBe(2100); // 3% of the metal alone
    expect(c.total).toBe(72100);
  });

  it("takes a GST rate as input, since a rate is a policy that changes", () => {
    expect(jewelleryCost(RATE, 8, 12, 0).total).toBe(62720);
    expect(jewelleryCost(RATE, 8, 12, 5).total).toBe(65856);
  });

  it("never returns a negative bill from a missing rate or weight", () => {
    expect(jewelleryCost(0, 8, 12).total).toBe(0);
    expect(jewelleryCost(RATE, 0, 12)).toMatchObject({ total: 0, perGram: 0 });
    expect(jewelleryCost(-100, -5, -12).total).toBe(0);
  });
});

describe("jewellery cost — weights", () => {
  it("counts sovereigns at 8 grams each", () => {
    expect(toSovereigns(8)).toBe(1);
    expect(toSovereigns(24)).toBe(3);
    expect(toSovereigns(4)).toBe(0.5);
  });

  it("lists the everyday weights, in order", () => {
    expect(weightRows(0)).toEqual([1, 8, 16, 24, 40]);
  });

  it("slots a custom weight into place without duplicating one already there", () => {
    expect(weightRows(12)).toEqual([1, 8, 12, 16, 24, 40]);
    expect(weightRows(8)).toEqual([1, 8, 16, 24, 40]);
    expect(weightRows(0.5)).toEqual([0.5, 1, 8, 16, 24, 40]);
  });
});
