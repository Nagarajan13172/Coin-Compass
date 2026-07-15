import { describe, it, expect } from "vitest";
import { splitByFrequency, FREQUENT_MAX, FREQUENT_SPLIT_THRESHOLD } from "./categoryOrder";
import type { Category } from "@/lib/types";

/**
 * splitByFrequency ranks the "frequently used" band for the category picker and
 * the category filter. Input is assumed already A–Z (that's what useCategories
 * delivers), so these specs pass A–Z fixtures and assert the invariants:
 * usage-desc ranking, stable A–Z ties, the cap, the length threshold, and the
 * cold-start fallbacks.
 */

// Minimal Category factory — only the fields splitByFrequency reads matter.
const cat = (name: string, usageCount = 0): Category => ({
  _id: name.toLowerCase(),
  name,
  type: "expense",
  icon: "tag",
  color: "#000",
  order: 0,
  usageCount,
});

// N distinct zero-usage categories, already A–Z (A, B, C, …), to clear the
// length threshold in tests that care about ranking rather than the threshold.
const azList = (n: number, usage: Record<string, number> = {}) =>
  Array.from({ length: n }, (_, i) => {
    const name = String.fromCharCode(65 + i); // "A", "B", …
    return cat(name, usage[name] ?? 0);
  });

describe("splitByFrequency", () => {
  it("returns no band and the input untouched when the list is at/below the threshold", () => {
    const list = azList(FREQUENT_SPLIT_THRESHOLD, { A: 99, B: 50 }); // exactly threshold, even with usage
    const { frequent, rest } = splitByFrequency(list);
    expect(frequent).toEqual([]);
    expect(rest).toBe(list); // same reference — no work done
  });

  it("returns no band when the list is long enough but nothing has usage (cold start)", () => {
    const list = azList(FREQUENT_SPLIT_THRESHOLD + 3); // all usageCount 0
    const { frequent, rest } = splitByFrequency(list);
    expect(frequent).toEqual([]);
    expect(rest).toBe(list);
  });

  it("floats used categories into the band, ranked by usage descending", () => {
    const list = azList(10, { C: 5, A: 20, F: 12 });
    const { frequent } = splitByFrequency(list);
    expect(frequent.map((c) => c.name)).toEqual(["A", "F", "C"]);
  });

  it("keeps equal-usage categories in A–Z order (stable ranking, no explicit tiebreak)", () => {
    const list = azList(10, { D: 7, B: 7, A: 7 }); // A, B, D all used 7 times
    const { frequent } = splitByFrequency(list);
    // Input is A–Z and sort is stable, so ties resolve alphabetically.
    expect(frequent.map((c) => c.name)).toEqual(["A", "B", "D"]);
  });

  it("caps the band at FREQUENT_MAX and leaves the overflow in rest", () => {
    // Every category used, descending usage A=100, B=99, … so rank == A–Z here.
    const usage: Record<string, number> = {};
    for (let i = 0; i < 10; i++) usage[String.fromCharCode(65 + i)] = 100 - i;
    const list = azList(10, usage);
    const { frequent, rest } = splitByFrequency(list);
    expect(frequent).toHaveLength(FREQUENT_MAX);
    expect(frequent.map((c) => c.name)).toEqual(["A", "B", "C", "D", "E", "F"]);
    // The 7th+ most-used fall back into rest.
    expect(rest.map((c) => c.name)).toEqual(["G", "H", "I", "J"]);
  });

  it("excludes band members from rest and preserves rest's A–Z order", () => {
    const list = azList(10, { E: 3, A: 9, I: 1 });
    const { frequent, rest } = splitByFrequency(list);
    const restNames = rest.map((c) => c.name);
    // None of the frequent ids leak into rest.
    for (const c of frequent) expect(restNames).not.toContain(c.name);
    // Rest is still sorted A–Z (the input order, minus the band).
    expect(restNames).toEqual([...restNames].sort());
  });

  it("honours custom max/threshold options", () => {
    const list = azList(6, { A: 5, B: 4, C: 3 });
    // Default threshold (8) would suppress the band for a 6-item list…
    expect(splitByFrequency(list).frequent).toEqual([]);
    // …but a lower threshold + max surfaces a capped band.
    const { frequent } = splitByFrequency(list, { threshold: 4, max: 2 });
    expect(frequent.map((c) => c.name)).toEqual(["A", "B"]);
  });
});
