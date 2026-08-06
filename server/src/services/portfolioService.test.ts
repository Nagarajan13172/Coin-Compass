import { describe, it, expect } from "vitest";
import {
  allocateFifo,
  costBasisFor,
  daysToLongTerm,
  gainTypeFor,
  longTermFrom,
  realizedFor,
  valuePosition,
  type LotLike,
} from "./portfolioService";

const day = (iso: string) => new Date(`${iso}T00:00:00`);

/** A lot with sane defaults; override only what a case is actually about. */
function lot(over: Partial<LotLike> & Pick<LotLike, "id">): LotLike {
  const qty = over.qty ?? 10;
  return {
    qty,
    qtyRemaining: over.qtyRemaining ?? qty,
    buyPrice: over.buyPrice ?? 100,
    buyDate: over.buyDate ?? day("2026-01-01"),
    fees: over.fees ?? 0,
    ...over,
  };
}

describe("portfolioService — the long-term capital gains boundary", () => {
  // s.2(42A): listed equity is SHORT-term when held for "not more than" 12
  // months. The anniversary itself is therefore still short-term, and the day
  // after is the first long-term day. This off-by-one is the whole rule.
  it("treats the 12-month anniversary itself as short-term", () => {
    expect(gainTypeFor(day("2025-01-01"), day("2026-01-01"))).toBe("STCG");
  });

  it("turns long-term the day after the anniversary", () => {
    expect(gainTypeFor(day("2025-01-01"), day("2026-01-02"))).toBe("LTCG");
  });

  it("is short-term one day before the anniversary", () => {
    expect(gainTypeFor(day("2025-01-01"), day("2025-12-31"))).toBe("STCG");
  });

  it("puts the long-term date one day after the anniversary", () => {
    expect(longTermFrom(day("2025-03-10"))).toEqual(day("2026-03-11"));
  });

  it("rolls a 29 Feb purchase forward, never backward", () => {
    // 29 Feb 2024 has no 2025 anniversary; delaying long-term status by a day is
    // the conservative direction (it can only ever cost the taxpayer nothing).
    expect(longTermFrom(day("2024-02-29"))).toEqual(day("2025-03-02"));
  });

  it("counts whole days remaining, and reports 0 once already long-term", () => {
    expect(daysToLongTerm(day("2025-01-01"), day("2025-12-30"))).toBe(3); // → 2 Jan 2026
    expect(daysToLongTerm(day("2025-01-01"), day("2026-01-01"))).toBe(1); // tomorrow
    expect(daysToLongTerm(day("2025-01-01"), day("2026-01-02"))).toBe(0);
    expect(daysToLongTerm(day("2025-01-01"), day("2026-06-01"))).toBe(0); // long past
  });
});

describe("portfolioService — cost basis", () => {
  it("pro-rates fees by quantity, so a half sale carries half the brokerage", () => {
    const l = lot({ id: "a", qty: 10, buyPrice: 100, fees: 20 });
    expect(costBasisFor(l, 10)).toBe(1020);
    expect(costBasisFor(l, 5)).toBe(510); // 500 + half the ₹20
  });

  it("never divides by a zero quantity", () => {
    expect(costBasisFor(lot({ id: "a", qty: 0, fees: 20 }), 0)).toBe(0);
  });
});

describe("portfolioService — FIFO allocation", () => {
  const lotA = lot({ id: "A", qty: 10, buyPrice: 100, buyDate: day("2025-01-10") });
  const lotB = lot({ id: "B", qty: 10, buyPrice: 150, buyDate: day("2025-06-10") });

  it("consumes the oldest lot first, spilling into the next", () => {
    const { allocations, shortfall } = allocateFifo([lotA, lotB], 15, day("2026-08-01"));
    expect(shortfall).toBe(0);
    expect(allocations.map((a) => [a.lot, a.qty])).toEqual([
      ["A", 10],
      ["B", 5],
    ]);
    expect(allocations[0].costBasis).toBe(1000);
    expect(allocations[1].costBasis).toBe(750);
  });

  it("orders by buy date regardless of the order it was handed the lots", () => {
    const { allocations } = allocateFifo([lotB, lotA], 12, day("2026-08-01"));
    expect(allocations[0].lot).toBe("A");
  });

  it("tags each slice with its own holding period", () => {
    // Sold 1 Feb 2026: lot A (Jan 2025) is long-term, lot B (Jun 2025) is not.
    const { allocations } = allocateFifo([lotA, lotB], 15, day("2026-02-01"));
    expect(allocations[0].gainType).toBe("LTCG");
    expect(allocations[1].gainType).toBe("STCG");
  });

  it("reports a shortfall rather than over-allocating", () => {
    const { allocations, shortfall } = allocateFifo([lotA], 25, day("2026-08-01"));
    expect(shortfall).toBe(15);
    expect(allocations.reduce((s, a) => s + a.qty, 0)).toBe(10);
  });

  it("skips lots that are already fully sold", () => {
    const spent = lot({ id: "A", qty: 10, qtyRemaining: 0, buyDate: day("2025-01-10") });
    const { allocations } = allocateFifo([spent, lotB], 5, day("2026-08-01"));
    expect(allocations).toHaveLength(1);
    expect(allocations[0].lot).toBe("B");
  });

  it("does not mutate the lots it was given", () => {
    const lots = [lot({ id: "A", qty: 10 })];
    allocateFifo(lots, 10, day("2026-08-01"));
    expect(lots[0].qtyRemaining).toBe(10);
  });

  it("treats float dust from fractional quantities as fully allocated", () => {
    const frac = lot({ id: "A", qty: 0.3, buyPrice: 100, buyDate: day("2025-01-10") });
    expect(allocateFifo([frac], 0.1 + 0.2, day("2026-08-01")).shortfall).toBe(0);
  });
});

describe("portfolioService — realized profit", () => {
  it("is proceeds less cost basis less the fees paid to sell", () => {
    const { allocations } = allocateFifo(
      [lot({ id: "A", qty: 10, buyPrice: 100, fees: 20, buyDate: day("2025-01-10") })],
      10,
      day("2026-08-01")
    );
    // Sold 10 at ₹150 = 1500, cost 1000 + 20 fees = 1020, sale fees 30.
    const r = realizedFor(allocations, 150, 30);
    expect(r.costBasis).toBe(1020);
    expect(r.proceeds).toBe(1470); // net of sale fees
    expect(r.realizedPL).toBe(450);
  });

  it("splits the gain by holding period and still sums to the total", () => {
    const lots = [
      lot({ id: "A", qty: 10, buyPrice: 100, buyDate: day("2025-01-10") }), // long-term
      lot({ id: "B", qty: 10, buyPrice: 120, buyDate: day("2025-11-10") }), // short-term
    ];
    const { allocations } = allocateFifo(lots, 15, day("2026-02-01"));
    const r = realizedFor(allocations, 150, 0);

    expect(r.realizedLongTerm).toBe(500); // 10 × (150 − 100)
    expect(r.realizedShortTerm).toBe(150); // 5 × (150 − 120)
    expect(r.realizedPL).toBe(r.realizedLongTerm + r.realizedShortTerm);
  });

  it("apportions sale fees across both halves rather than dumping them on one", () => {
    const lots = [
      lot({ id: "A", qty: 10, buyPrice: 100, buyDate: day("2025-01-10") }),
      lot({ id: "B", qty: 10, buyPrice: 100, buyDate: day("2025-11-10") }),
    ];
    const { allocations } = allocateFifo(lots, 20, day("2026-02-01"));
    const r = realizedFor(allocations, 150, 100);
    // Equal quantities → equal shares of the ₹100 fee.
    expect(r.realizedLongTerm).toBe(450);
    expect(r.realizedShortTerm).toBe(450);
  });

  it("goes negative on a loss", () => {
    const { allocations } = allocateFifo([lot({ id: "A", qty: 10, buyPrice: 100 })], 10, day("2026-08-01"));
    expect(realizedFor(allocations, 80, 0).realizedPL).toBe(-200);
  });
});

describe("portfolioService — position valuation", () => {
  it("values remaining shares at the market price", () => {
    const v = valuePosition([lot({ id: "A", qty: 10, buyPrice: 100, fees: 20 })], 150);
    expect(v.qty).toBe(10);
    expect(v.investedCost).toBe(1020);
    expect(v.avgCost).toBe(102);
    expect(v.marketValue).toBe(1500);
    expect(v.unrealized).toBe(480);
  });

  it("counts only what is left after a partial sale", () => {
    const v = valuePosition([lot({ id: "A", qty: 10, qtyRemaining: 4, buyPrice: 100, fees: 20 })], 150);
    expect(v.qty).toBe(4);
    expect(v.investedCost).toBe(408); // 400 + 4/10 of the ₹20
    expect(v.marketValue).toBe(600);
  });

  // A failed upstream fetch must never read as "your shares are worthless" — that
  // would silently wipe the position out of net worth.
  it("falls back to cost when there is no price, never to zero", () => {
    const v = valuePosition([lot({ id: "A", qty: 10, buyPrice: 100 })], null);
    expect(v.marketValue).toBe(1000);
    expect(v.unrealized).toBe(0);
  });

  it("returns zeroes — not NaN — for a fully sold position", () => {
    const v = valuePosition([lot({ id: "A", qty: 10, qtyRemaining: 0 })], 150);
    expect(v).toEqual({
      qty: 0, investedCost: 0, avgCost: 0, marketValue: 0, unrealized: 0, unrealizedPct: 0,
    });
    expect(Number.isNaN(v.unrealizedPct)).toBe(false);
  });

  it("reports 0% rather than NaN when the cost basis is zero", () => {
    const v = valuePosition([lot({ id: "A", qty: 10, buyPrice: 0, fees: 0 })], 150);
    expect(v.unrealizedPct).toBe(0);
  });
});
