import { describe, it, expect } from "vitest";
import { budgetTotals } from "./budgets";
import type { Budget } from "@/lib/types";

/**
 * budgetTotals answers "how much of this period's allowance is still unspent".
 * The trap it has to avoid is double counting: an overall budget already caps
 * every category, so adding the per-category budgets on top would count the same
 * spending twice and overstate what's left.
 */
const b = (amount: number, spent: number, opts: Partial<Budget> = {}): Budget =>
  ({
    _id: `${amount}-${spent}-${opts.period ?? "monthly"}-${opts.category ? "cat" : "all"}`,
    category: { _id: "c1", name: "Food" },
    amount,
    spent,
    period: "monthly",
    remaining: amount - spent,
    percent: amount > 0 ? Math.round((spent / amount) * 100) : 0,
    over: spent > amount,
    currency: "INR",
    startDate: "2026-07-01",
    ...opts,
  }) as Budget;

describe("budgetTotals — the headline numbers", () => {
  it("sums planned and spent across category budgets", () => {
    // The nine real budgets, rounded.
    const t = budgetTotals([
      b(14000, 13324),
      b(4500, 4174),
      b(3600, 3594),
      b(3600, 3498),
      b(3000, 2402),
      b(2600, 3594),
      b(2200, 1907),
      b(2000, 1610),
      b(2000, 1570),
    ]);
    expect(t.planned).toBe(37500);
    expect(t.spent).toBe(35673);
    expect(t.left).toBe(1827);
  });

  it("reports left as negative when the set as a whole is over", () => {
    const t = budgetTotals([b(1000, 1500), b(2000, 2000)]);
    expect(t.left).toBe(-500);
  });

  it("computes percent used and never divides by zero", () => {
    expect(budgetTotals([b(1000, 250)]).percent).toBe(25);
    expect(budgetTotals([b(0, 0)]).percent).toBe(0);
  });

  it("returns zeroes for an empty set", () => {
    expect(budgetTotals([])).toMatchObject({ planned: 0, spent: 0, left: 0, percent: 0, overCount: 0 });
  });
});

describe("budgetTotals — overall budget must not double count", () => {
  it("uses the overall budget alone when one is present", () => {
    const t = budgetTotals([
      b(35000, 20000, { category: null }), // overall
      b(14000, 13000), // already inside the overall
      b(4000, 3000),
    ]);
    // Not 53,000 / 36,000 — the overall already covers the others.
    expect(t.planned).toBe(35000);
    expect(t.spent).toBe(20000);
    expect(t.left).toBe(15000);
  });

  it("still counts an over-limit category even when the overall is healthy", () => {
    const t = budgetTotals([
      b(35000, 10000, { category: null }), // overall, well under
      b(1000, 5000), // this one has blown past
    ]);
    expect(t.left).toBe(25000);
    expect(t.overCount).toBe(1);
  });
});

describe("budgetTotals — periods", () => {
  it("names the period when they all agree", () => {
    const t = budgetTotals([b(100, 10), b(200, 20)]);
    expect(t.period).toBe("monthly");
    expect(t.mixedPeriods).toBe(false);
  });

  it("flags a mix so the total isn't read as apples to apples", () => {
    const t = budgetTotals([b(100, 10), b(200, 20, { period: "weekly" })]);
    expect(t.mixedPeriods).toBe(true);
    expect(t.period).toBeNull();
  });
});

describe("budgetTotals — over count", () => {
  it("counts budgets flagged over or at 100%", () => {
    const t = budgetTotals([b(1000, 1500), b(1000, 1000), b(1000, 200)]);
    expect(t.overCount).toBe(2); // the over one, and the one exactly at 100%
  });
});
