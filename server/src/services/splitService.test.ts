import { describe, it, expect } from "vitest";
import { splitEqually, validateShares, SPLIT_EPSILON } from "./splitService";

/**
 * splitEqually is THE division rule, isolated. The property that matters is not
 * "each share is total/n" — it's that the shares SUM BACK to the bill exactly.
 * A split that loses a paisa leaves a phantom balance in the "Money Lent"
 * receivable that can never be settled.
 */
describe("splitEqually — shares always reconstruct the bill", () => {
  it("divides a clean bill evenly (3,000 across 6 — the KFC case)", () => {
    expect(splitEqually(3000, 6)).toEqual([500, 500, 500, 500, 500, 500]);
  });

  it("a bill that does not divide gives the odd paise to the earliest shares", () => {
    // 1000/3 = 333.333…; the extra paisa goes to index 0 (the payer by convention).
    expect(splitEqually(1000, 3)).toEqual([333.34, 333.33, 333.33]);
  });

  it("distributes more than one leftover paisa, one each (100 across 3 → 2 extra)", () => {
    // 10000 paise / 3 = 3333 each, 1 left over.
    expect(splitEqually(100, 3)).toEqual([33.34, 33.33, 33.33]);
    // 0.10 / 4 = 2.5 paise each → 2 shares get 3p, 2 get 2p.
    expect(splitEqually(0.1, 4)).toEqual([0.03, 0.03, 0.02, 0.02]);
  });

  it("one person takes the whole bill", () => {
    expect(splitEqually(2500, 1)).toEqual([2500]);
  });

  it("a zero bill splits into zeros, not NaN", () => {
    expect(splitEqually(0, 4)).toEqual([0, 0, 0, 0]);
  });

  it("never loses or invents money, for any bill and any group size", () => {
    for (const total of [3000, 1000, 999.99, 0.03, 7, 12345.67, 1]) {
      for (let n = 1; n <= 12; n++) {
        const shares = splitEqually(total, n);
        expect(shares).toHaveLength(n);
        const sum = shares.reduce((a, b) => a + b, 0);
        expect(Math.abs(sum - total)).toBeLessThan(SPLIT_EPSILON);
      }
    }
  });

  it("shares differ by at most one paisa, so nobody is visibly short-changed", () => {
    for (const total of [1000, 999.99, 7, 0.05]) {
      for (let n = 2; n <= 9; n++) {
        const shares = splitEqually(total, n);
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(0.01 + 1e-9);
      }
    }
  });

  it("rejects a group size that isn't a positive whole number", () => {
    expect(() => splitEqually(100, 0)).toThrow();
    expect(() => splitEqually(100, -2)).toThrow();
    expect(() => splitEqually(100, 2.5)).toThrow();
  });

  it("rejects a negative bill", () => {
    expect(() => splitEqually(-100, 2)).toThrow();
  });
});

/**
 * validateShares is THE conservation rule: your share + everyone else's must
 * equal the bill. If it ever passes when they don't, the ledger legs (an expense
 * for your share + transfers for theirs) stop adding up to what left the account.
 */
describe("validateShares — a split conserves money", () => {
  it("accepts the KFC split (500 mine + 5 × 500 = 3,000)", () => {
    expect(() => validateShares(3000, 500, [500, 500, 500, 500, 500])).not.toThrow();
  });

  it("accepts a split where you paid but ate nothing (your share 0)", () => {
    expect(() => validateShares(1000, 0, [500, 500])).not.toThrow();
  });

  it("accepts unequal (exact) shares that still add up", () => {
    expect(() => validateShares(1000, 100, [600, 300])).not.toThrow();
  });

  it("accepts the rounded output of splitEqually — the two rules agree", () => {
    const [mine, ...others] = splitEqually(1000, 3);
    expect(() => validateShares(1000, mine, others)).not.toThrow();
  });

  it("rejects shares that add up to LESS than the bill (money vanishes)", () => {
    expect(() => validateShares(3000, 500, [500, 500, 500, 500])).toThrow(/add up/i);
  });

  it("rejects shares that add up to MORE than the bill (money invented)", () => {
    expect(() => validateShares(3000, 500, [500, 500, 500, 500, 500, 500])).toThrow(/add up/i);
  });

  it("tolerates float dust but not a real paisa gap", () => {
    // 0.1 + 0.2 = 0.30000000000000004 — must not be rejected.
    expect(() => validateShares(0.3, 0.1, [0.2])).not.toThrow();
    // A genuine one-paisa shortfall must be caught.
    expect(() => validateShares(100, 50, [49.99])).toThrow(/add up/i);
  });

  it("rejects a split with nobody to split with", () => {
    expect(() => validateShares(3000, 3000, [])).toThrow(/at least one person/i);
  });

  it("rejects negative shares", () => {
    expect(() => validateShares(1000, -100, [1100])).toThrow(/negative/i);
    expect(() => validateShares(1000, 1100, [-100])).toThrow(/negative/i);
  });

  it("rejects a non-positive bill", () => {
    expect(() => validateShares(0, 0, [0])).toThrow(/greater than 0/i);
    expect(() => validateShares(-100, -50, [-50])).toThrow(/greater than 0/i);
  });
});
