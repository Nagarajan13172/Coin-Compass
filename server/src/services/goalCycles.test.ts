import { describe, it, expect } from "vitest";
import { isCycleDue, nextCycleEnd, rollCycle, rollForward, type CycleState } from "./goalCycles";
import { monthlyFunding, monthlyRate, projectedCompletion, scheduleVerdict } from "./goalFunding";

const day = (iso: string) => new Date(`${iso}T00:00:00`);

/** A yearly insurance fund: ₹12,000 due every 12 February. */
function insurance(over: Partial<CycleState> = {}): CycleState {
  return {
    repeat: "yearly",
    targetDate: day("2027-02-12"),
    savedAmount: 12000,
    targetAmount: 12000,
    linked: false,
    ...over,
  };
}

describe("goal cycles — when a cycle ends", () => {
  it("chains from the due date, keeping the day of the month", () => {
    expect(nextCycleEnd(day("2027-02-12"), "yearly")).toEqual(day("2028-02-12"));
    expect(nextCycleEnd(day("2027-02-12"), "quarterly")).toEqual(day("2027-05-12"));
    expect(nextCycleEnd(day("2027-02-12"), "monthly")).toEqual(day("2027-03-12"));
  });

  it("has no end for a one-time goal", () => {
    expect(nextCycleEnd(day("2027-02-12"), "none")).toBeNull();
  });

  it("is due on the target date, not before", () => {
    expect(isCycleDue(insurance(), day("2027-02-11"))).toBe(false);
    expect(isCycleDue(insurance(), day("2027-02-12"))).toBe(true);
    expect(isCycleDue(insurance(), day("2027-03-01"))).toBe(true);
  });

  it("never rolls a one-time goal, or one with no target date", () => {
    expect(isCycleDue(insurance({ repeat: "none" }), day("2030-01-01"))).toBe(false);
    expect(isCycleDue(insurance({ targetDate: null }), day("2030-01-01"))).toBe(false);
  });
});

describe("goal cycles — rolling over", () => {
  it("spends one target's worth and moves the due date on a year", () => {
    const rolled = rollCycle(insurance(), day("2027-02-12"))!;
    expect(rolled.closed).toMatchObject({ targetAmount: 12000, savedAmount: 12000 });
    expect(rolled.savedAmount).toBe(0);
    expect(rolled.targetDate).toEqual(day("2028-02-12"));
  });

  it("carries a surplus into the next cycle", () => {
    const rolled = rollCycle(insurance({ savedAmount: 14500 }), day("2027-02-12"))!;
    expect(rolled.savedAmount).toBe(2500);
  });

  it("carries a shortfall too — an under-funded cycle doesn't lose what it saved", () => {
    const rolled = rollCycle(insurance({ savedAmount: 9000 }), day("2027-02-12"))!;
    expect(rolled.savedAmount).toBe(0);
    expect(rolled.closed.savedAmount).toBe(9000); // recorded as what that year managed
  });

  it("leaves a wallet-tracking goal's total alone — the account is the record", () => {
    const rolled = rollCycle(insurance({ linked: true, savedAmount: 12000 }), day("2027-02-12"))!;
    expect(rolled.savedAmount).toBe(12000);
  });

  it("catches up when several cycles were missed", () => {
    // Nothing ran for two years; each pass consumes one target.
    const rolled = rollForward(insurance({ savedAmount: 30000 }), day("2029-03-01"));
    expect(rolled).toHaveLength(3);
    expect(rolled.map((r) => r.targetDate)).toEqual([
      day("2028-02-12"),
      day("2029-02-12"),
      day("2030-02-12"),
    ]);
    expect(rolled.at(-1)!.savedAmount).toBe(0); // 30,000 − 3 × 12,000, floored at 0
  });

  it("stops instead of spinning on a stale monthly goal", () => {
    const stale: CycleState = { ...insurance(), repeat: "monthly", targetDate: day("2000-01-01") };
    expect(rollForward(stale, day("2030-01-01")).length).toBeLessThanOrEqual(60);
  });
});

describe("goal funding — what's actually feeding it", () => {
  it("converts each frequency to a monthly rate", () => {
    expect(monthlyRate(1000, "monthly")).toBe(1000);
    expect(monthlyRate(12000, "yearly")).toBe(1000);
    expect(monthlyRate(1000, "monthly", 2)).toBe(500); // every second month
    expect(monthlyRate(500, "weekly")).toBeCloseTo(2166.67, 1);
  });

  it("adds up every rule paying in", () => {
    expect(
      monthlyFunding([
        { amount: 1000, frequency: "monthly" },
        { amount: 12000, frequency: "yearly" },
      ])
    ).toBe(2000);
  });

  it("projects a completion date, and admits when there is none", () => {
    expect(projectedCompletion(6000, 1000, day("2026-09-01"))).toEqual(day("2027-03-01"));
    expect(projectedCompletion(0, 1000, day("2026-09-01"))).toBeNull(); // already there
    expect(projectedCompletion(6000, 0, day("2026-09-01"))).toBeNull(); // nothing funding it
  });

  it("calls it behind only when the projection lands after the target date", () => {
    expect(scheduleVerdict(day("2027-01-01"), day("2027-02-12"))).toBe("on_track");
    expect(scheduleVerdict(day("2027-03-01"), day("2027-02-12"))).toBe("behind");
    expect(scheduleVerdict(day("2027-03-01"), null)).toBe("unknown");
    expect(scheduleVerdict(null, day("2027-02-12"))).toBe("unknown");
  });
});
