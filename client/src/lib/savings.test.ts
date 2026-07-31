import { describe, it, expect } from "vitest";
import { savingsRate } from "./savings";
import type { Summary } from "@/lib/types";

/**
 * The savings rate used to divide `net` (income − ALL expense) by income, which
 * counted deposits and loan principal as money spent. These specs pin the fixed
 * definition: measure against consumption only.
 */
const s = (income: number, consumption: number) =>
  ({ income, consumption }) as Pick<Summary, "income" | "consumption">;

describe("savingsRate", () => {
  it("measures against consumption, not total outflow", () => {
    // July: earned 2,47,391; total outflow 2,16,083 of which 1,09,120 was a
    // deposit + loan principal, leaving 1,06,963 actually consumed.
    expect(savingsRate(s(247391, 106963))).toBe(57);
  });

  it("no longer reports the old, understated figure", () => {
    // Same month measured the old way (net / income) gave 13%.
    const old = Math.round(((247391 - 216083) / 247391) * 100);
    expect(old).toBe(13);
    expect(savingsRate(s(247391, 106963))).toBeGreaterThan(old);
  });

  it("is 100% when nothing is consumed", () => {
    expect(savingsRate(s(50000, 0))).toBe(100);
  });

  it("is 0% when consumption exactly equals income", () => {
    expect(savingsRate(s(50000, 50000))).toBe(0);
  });

  it("goes negative when consumption exceeds income", () => {
    expect(savingsRate(s(50000, 75000))).toBe(-50);
  });

  it("returns null with no income, so callers render a dash not 0%", () => {
    expect(savingsRate(s(0, 5000))).toBeNull();
    expect(savingsRate(s(-100, 5000))).toBeNull();
  });

  it("returns null when the summary is absent", () => {
    expect(savingsRate(undefined)).toBeNull();
  });

  it("rounds to a whole percent", () => {
    expect(savingsRate(s(3, 1))).toBe(67);
  });
});
