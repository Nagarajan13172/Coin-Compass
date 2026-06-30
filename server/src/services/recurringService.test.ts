import { describe, it, expect } from "vitest";
import { advance } from "./recurringService";

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
