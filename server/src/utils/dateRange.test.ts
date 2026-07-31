import { describe, it, expect } from "vitest";
import { resolvePeriod, startOfWeek, addMonths, addDays, exclusiveEnd } from "./dateRange";

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

/**
 * `to` arrives in two shapes and they mean different things. Conflating them
 * stretched every report a day long: "last month" ran into the 1st of the
 * current month, so the period-over-period comparison reported this month's
 * opening spend as if it were last month's.
 */
describe("exclusiveEnd", () => {
  it("extends a bare day to the start of the next one", () => {
    const end = exclusiveEnd("2026-06-30");
    expect(end.getTime()).toBe(new Date("2026-06-30").getTime() + 86_400_000);
  });

  it("leaves a full ISO instant exactly as given", () => {
    const iso = "2026-06-30T18:29:59.999Z";
    expect(exclusiveEnd(iso).toISOString()).toBe(iso);
  });

  it("does not let an end-of-month instant leak into the next month", () => {
    // The exact value the Reports page sends for "June" in IST.
    const end = exclusiveEnd("2026-06-30T18:29:59.999Z");
    expect(end.getTime()).toBeLessThan(new Date("2026-07-01T00:00:00.000Z").getTime());
  });

  it("keeps a whole-day range exactly 24h wide", () => {
    const start = new Date("2026-06-30");
    expect(exclusiveEnd("2026-06-30").getTime() - start.getTime()).toBe(86_400_000);
  });

  it("falls back to now on an unparseable value rather than an Invalid Date", () => {
    expect(Number.isNaN(exclusiveEnd("not-a-date").getTime())).toBe(false);
  });
});
