import { describe, it, expect } from "vitest";
import { applyContribution, nextAchievedAt } from "./goalService";

const NOW = new Date(2026, 6, 15); // 15 Jul 2026
const EARLIER = new Date(2026, 5, 1); // 1 Jun 2026

describe("goalService.nextAchievedAt", () => {
  it("stamps `now` the moment saved first reaches the target", () => {
    expect(nextAchievedAt(12000, 12000, null, NOW)).toEqual(NOW);
    expect(nextAchievedAt(13000, 12000, null, NOW)).toEqual(NOW); // overfunded still counts
  });

  it("keeps an existing achievedAt (doesn't overwrite the original completion date)", () => {
    expect(nextAchievedAt(15000, 12000, EARLIER, NOW)).toEqual(EARLIER);
  });

  it("clears achievedAt when saved drops back below the target", () => {
    expect(nextAchievedAt(11000, 12000, EARLIER, NOW)).toBeNull();
  });

  it("is never achieved when there is no target", () => {
    expect(nextAchievedAt(5000, 0, null, NOW)).toBeNull();
  });
});

describe("goalService.applyContribution", () => {
  const goal = (saved: number, target = 12000, achievedAt: Date | null = null) => ({
    savedAmount: saved,
    targetAmount: target,
    achievedAt,
  });

  it("adds the amount and reports it as applied (the car-insurance auto-debit case)", () => {
    const r = applyContribution(goal(0), 1000, NOW);
    expect(r.savedAmount).toBe(1000);
    expect(r.applied).toBe(1000);
    expect(r.achievedAt).toBeNull(); // 1k of 12k — not there yet
  });

  it("marks the goal achieved when a contribution crosses the target", () => {
    const r = applyContribution(goal(11000), 1000, NOW);
    expect(r.savedAmount).toBe(12000);
    expect(r.achievedAt).toEqual(NOW);
  });

  it("withdraws on a negative delta and clears achievedAt when it dips below target", () => {
    const r = applyContribution(goal(12000, 12000, EARLIER), -1000, NOW);
    expect(r.savedAmount).toBe(11000);
    expect(r.applied).toBe(-1000);
    expect(r.achievedAt).toBeNull();
  });

  it("clamps saved at 0 and reports the CLAMPED delta, so a reversal stays exact", () => {
    // Withdraw more than exists: saved floors at 0, and applied reflects the real
    // change (-500, not -800) so the stored value can be reversed precisely.
    const r = applyContribution(goal(500), -800, NOW);
    expect(r.savedAmount).toBe(0);
    expect(r.applied).toBe(-500);
  });

  it("apply-then-reverse returns the saved total to where it started", () => {
    const start = goal(3000);
    const forward = applyContribution(start, 1000, NOW);
    const back = applyContribution(
      { ...start, savedAmount: forward.savedAmount, achievedAt: forward.achievedAt },
      -forward.applied,
      NOW
    );
    expect(back.savedAmount).toBe(start.savedAmount);
  });
});
