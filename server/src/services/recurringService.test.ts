import { describe, it, expect } from "vitest";
import { advance, nextRunFrom, previewOccurrences } from "./recurringService";

describe("recurringService.advance", () => {
  const base = new Date(2026, 0, 15); // 15 Jan 2026

  it("advances daily by interval", () => {
    expect(advance(base, "daily", 1).getDate()).toBe(16);
    expect(advance(base, "daily", 10).getDate()).toBe(25);
  });

  it("advances weekly by interval (7 days * n)", () => {
    const next = advance(base, "weekly", 2);
    expect(Math.round((next.getTime() - base.getTime()) / 86400000)).toBe(14);
  });

  it("advances monthly", () => {
    expect(advance(base, "monthly", 1).getMonth()).toBe(1); // Feb
    expect(advance(base, "monthly", 3).getMonth()).toBe(3); // Apr
  });

  it("advances yearly", () => {
    expect(advance(base, "yearly", 1).getFullYear()).toBe(2027);
  });

  it("does not mutate the input date", () => {
    const copy = new Date(base);
    advance(base, "monthly", 5);
    expect(base.getTime()).toBe(copy.getTime());
  });
});

describe("recurringService.nextRunFrom", () => {
  it("rolls a past start forward to the first occurrence >= now (no back-posting)", () => {
    const start = new Date(2026, 0, 1); // 1 Jan
    const now = new Date(2026, 2, 15); // 15 Mar
    const next = nextRunFrom(start, "monthly", 1, now);
    expect(next >= now).toBe(true);
    expect(next.getMonth()).toBe(3); // 1 Apr (first monthly occurrence after 15 Mar)
    expect(next.getDate()).toBe(1);
  });

  it("returns a future start unchanged", () => {
    const start = new Date(2026, 5, 1);
    const now = new Date(2026, 0, 1);
    expect(nextRunFrom(start, "monthly", 1, now).getTime()).toBe(start.getTime());
  });

  it("returns the start when it equals now", () => {
    const start = new Date(2026, 0, 15);
    expect(nextRunFrom(start, "daily", 1, start).getTime()).toBe(start.getTime());
  });
});

describe("recurringService.previewOccurrences", () => {
  it("lists the next N run dates starting at nextRun", () => {
    const rule = {
      frequency: "monthly",
      interval: 1,
      nextRun: new Date(2026, 0, 10),
      endDate: null,
    };
    const dates = previewOccurrences(rule, 3);
    expect(dates.map((d) => d.getMonth())).toEqual([0, 1, 2]);
  });

  it("stops at endDate", () => {
    const rule = {
      frequency: "monthly",
      interval: 1,
      nextRun: new Date(2026, 0, 10),
      endDate: new Date(2026, 1, 15), // mid Feb — allows Jan & Feb only
    };
    const dates = previewOccurrences(rule, 5);
    expect(dates).toHaveLength(2);
  });
});
