import { describe, it, expect } from "vitest";
import { resolvePeriod, startOfWeek, addMonths, addDays } from "./dateRange";

describe("dateRange", () => {
  it("resolves a month period to [1st, next 1st)", () => {
    const ref = new Date(2026, 5, 15); // 15 Jun 2026
    const { start, end } = resolvePeriod("month", ref);
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(5);
    expect(end.getMonth()).toBe(6);
    expect(end.getDate()).toBe(1);
  });

  it("resolves a week starting on Monday", () => {
    const wed = new Date(2026, 5, 17); // Wednesday
    const { start, end } = resolvePeriod("week", wed, 1);
    expect(start.getDay()).toBe(1); // Monday
    expect(Math.round((end.getTime() - start.getTime()) / 86400000)).toBe(7);
  });

  it("resolves a year period", () => {
    const ref = new Date(2026, 5, 15);
    const { start, end } = resolvePeriod("year", ref);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(0);
    expect(end.getFullYear()).toBe(2027);
  });

  it("startOfWeek normalises to the configured first day", () => {
    const sun = new Date(2026, 5, 21); // Sunday
    expect(startOfWeek(sun, 1).getDay()).toBe(1); // back to Monday 15th
  });

  it("addMonths and addDays shift correctly", () => {
    expect(addMonths(new Date(2026, 0, 31), 1).getMonth()).toBe(2); // Jan 31 -> Mar (JS rollover)
    expect(addDays(new Date(2026, 5, 30), 2).getDate()).toBe(2); // 30 Jun + 2 -> 2 Jul
  });
});
