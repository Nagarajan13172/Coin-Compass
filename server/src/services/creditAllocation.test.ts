import { describe, it, expect } from "vitest";
import { allocateOutstanding, type AllocatableEntry } from "./creditService";

const lend = (id: string, amount: number, day: number): AllocatableEntry => ({
  _id: id,
  direction: "given",
  amount,
  date: `2026-08-${String(day).padStart(2, "0")}T00:00:00.000Z`,
});
const repay = (id: string, amount: number, day: number, settles?: string): AllocatableEntry => ({
  _id: id,
  direction: "received",
  amount,
  date: `2026-08-${String(day).padStart(2, "0")}T00:00:00.000Z`,
  settles,
});

const out = (entries: AllocatableEntry[]) => Object.fromEntries(allocateOutstanding(entries));
const totalOutstanding = (entries: AllocatableEntry[]) =>
  [...allocateOutstanding(entries).values()].reduce((a, b) => a + b, 0);
/** The person-level figure the Credits page shows: given − received, floored at 0. */
const personNet = (entries: AllocatableEntry[]) =>
  Math.max(
    0,
    entries.reduce((s, e) => s + (e.direction === "given" ? e.amount : -e.amount), 0)
  );

/**
 * allocateOutstanding decides how much of each INDIVIDUAL lend is still owed —
 * the thing that makes a per-entry "settle up" mean something, where before only
 * the person's overall balance existed.
 */
describe("allocateOutstanding — per-entry settle-up", () => {
  it("an untouched lend is outstanding in full", () => {
    expect(out([lend("a", 500, 1)])).toEqual({ a: 500 });
  });

  it("a repayment naming a lend settles THAT lend, not another", () => {
    // Hari owes 500 (KFC) and 2,000 (loan). He pays back the KFC one.
    const entries = [lend("kfc", 500, 1), lend("loan", 2000, 2), repay("r", 500, 5, "kfc")];
    expect(out(entries)).toEqual({ kfc: 0, loan: 2000 });
  });

  it("settles the NAMED lend even when an older one is still open", () => {
    // Without naming, FIFO would have paid the older lend instead.
    const entries = [lend("old", 500, 1), lend("new", 800, 9), repay("r", 800, 10, "new")];
    expect(out(entries)).toEqual({ old: 500, new: 0 });
  });

  it("a part payment leaves the rest of that lend outstanding", () => {
    expect(out([lend("a", 500, 1), repay("r", 200, 5, "a")])).toEqual({ a: 300 });
  });

  it("a general repayment pays the oldest lend first", () => {
    const entries = [lend("old", 500, 1), lend("new", 800, 9), repay("r", 500, 10)];
    expect(out(entries)).toEqual({ old: 0, new: 800 });
  });

  it("a general repayment spills onto the next lend once the oldest is clear", () => {
    const entries = [lend("old", 500, 1), lend("new", 800, 9), repay("r", 900, 10)];
    expect(out(entries)).toEqual({ old: 0, new: 400 });
  });

  it("overpaying a named lend spills to the others instead of going negative", () => {
    const entries = [lend("a", 500, 1), lend("b", 800, 2), repay("r", 700, 5, "a")];
    // 500 clears a, the extra 200 rolls onto b — never { a: -200 }.
    expect(out(entries)).toEqual({ a: 0, b: 600 });
  });

  it("a repayment naming a lend that no longer exists still counts as money paid", () => {
    const entries = [lend("a", 500, 1), repay("r", 500, 5, "deleted-lend")];
    expect(out(entries)).toEqual({ a: 0 });
  });

  it("settling everything leaves every lend at zero", () => {
    const entries = [lend("a", 500, 1), lend("b", 800, 2), repay("r1", 500, 5, "a"), repay("r2", 800, 6, "b")];
    expect(out(entries)).toEqual({ a: 0, b: 0 });
  });

  it("never reports a negative outstanding, however much is repaid", () => {
    const entries = [lend("a", 500, 1), repay("r", 5000, 5, "a")];
    expect(out(entries)).toEqual({ a: 0 });
  });
});

/**
 * The invariant that keeps the two settle-up levels honest. If these drift, a
 * person's card and their individual rows would disagree about the same money.
 */
describe("allocateOutstanding — per-entry totals match the person's balance", () => {
  const cases: [string, AllocatableEntry[]][] = [
    ["nothing repaid", [lend("a", 500, 1), lend("b", 2000, 2)]],
    ["one named settle", [lend("a", 500, 1), lend("b", 2000, 2), repay("r", 500, 5, "a")]],
    ["one general settle", [lend("a", 500, 1), lend("b", 2000, 2), repay("r", 500, 5)]],
    ["named + general", [lend("a", 500, 1), lend("b", 2000, 2), repay("r1", 500, 5, "a"), repay("r2", 300, 6)]],
    ["part payments", [lend("a", 500, 1), repay("r1", 100, 3, "a"), repay("r2", 150, 4)]],
    ["fully settled", [lend("a", 500, 1), repay("r", 500, 5, "a")]],
    ["overpaid overall", [lend("a", 500, 1), repay("r", 900, 5)]],
    ["overpaid a named lend", [lend("a", 500, 1), lend("b", 800, 2), repay("r", 700, 5, "a")]],
  ];

  for (const [name, entries] of cases) {
    it(`sums to the person's net — ${name}`, () => {
      expect(totalOutstanding(entries)).toBeCloseTo(personNet(entries), 6);
    });
  }
});

describe("allocateOutstanding — edges", () => {
  it("handles a ledger with no lends at all", () => {
    expect(out([repay("r", 500, 1)])).toEqual({});
  });

  it("handles an empty ledger", () => {
    expect(out([])).toEqual({});
  });

  it("orders by date, not by insertion", () => {
    // "new" is listed first but dated later; the older lend must be paid first.
    const entries = [lend("new", 800, 9), lend("old", 500, 1), repay("r", 500, 10)];
    expect(out(entries)).toEqual({ old: 0, new: 800 });
  });

  it("keeps decimal shares exact enough to settle to zero", () => {
    const entries = [lend("a", 333.34, 1), repay("r", 333.34, 5, "a")];
    expect(out(entries).a).toBeCloseTo(0, 6);
  });
});
