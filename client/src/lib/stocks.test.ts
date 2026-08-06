import { describe, it, expect } from "vitest";
import { costBasisFor, daysToLongTerm, gainTypeFor, previewFifo } from "./stocks";
import type { StockLot } from "./types";

/**
 * The sell dialog previews what a sale will realise before it is committed. That
 * preview is only useful if it matches what the server then actually books — so
 * these cases are deliberately the SAME worked examples as
 * server/src/services/portfolioService.test.ts. If the two implementations ever
 * drift, one of the two suites breaks.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00`);

function lot(over: Partial<StockLot> & { _id: string }): StockLot {
  const qty = over.qty ?? 10;
  return {
    qty,
    qtyRemaining: over.qtyRemaining ?? qty,
    buyPrice: over.buyPrice ?? 100,
    buyDate: "2026-01-01",
    fees: 0,
    note: "",
    daysToLongTerm: 0,
    longTerm: false,
    ...over,
  };
}

describe("stocks — long-term boundary (mirrors the server)", () => {
  it("treats the 12-month anniversary as short-term, the day after as long", () => {
    expect(gainTypeFor(day("2025-01-01"), day("2026-01-01"))).toBe("STCG");
    expect(gainTypeFor(day("2025-01-01"), day("2026-01-02"))).toBe("LTCG");
  });

  it("counts whole days remaining, reporting 0 once already long-term", () => {
    expect(daysToLongTerm(day("2025-01-01"), day("2025-12-30"))).toBe(3);
    expect(daysToLongTerm(day("2025-01-01"), day("2026-01-02"))).toBe(0);
  });

  it("rolls a 29 Feb purchase forward", () => {
    expect(gainTypeFor(day("2024-02-29"), day("2025-03-01"))).toBe("STCG");
    expect(gainTypeFor(day("2024-02-29"), day("2025-03-02"))).toBe("LTCG");
  });
});

describe("stocks — cost basis (mirrors the server)", () => {
  it("pro-rates fees by quantity", () => {
    const l = lot({ _id: "a", qty: 10, buyPrice: 100, fees: 20 });
    expect(costBasisFor(l, 10)).toBe(1020);
    expect(costBasisFor(l, 5)).toBe(510);
  });
});

describe("stocks — FIFO preview (mirrors the server)", () => {
  const lotA = lot({ _id: "A", qty: 10, buyPrice: 100, buyDate: "2025-01-10" });
  const lotB = lot({ _id: "B", qty: 10, buyPrice: 150, buyDate: "2025-06-10" });

  it("consumes the oldest lot first", () => {
    const p = previewFifo([lotB, lotA], 15, 200, 0, day("2026-08-01"));
    expect(p.allocations.map((a) => [a.lotId, a.qty])).toEqual([
      ["A", 10],
      ["B", 5],
    ]);
    expect(p.shortfall).toBe(0);
  });

  it("splits the gain by holding period, matching the server's example", () => {
    // Same figures as the server suite: 10 @100 (Jan 25) + 5 @120 (Nov 25),
    // sold at 150 on 1 Feb 2026.
    const lots = [
      lot({ _id: "A", qty: 10, buyPrice: 100, buyDate: "2025-01-10" }),
      lot({ _id: "B", qty: 10, buyPrice: 120, buyDate: "2025-11-10" }),
    ];
    const p = previewFifo(lots, 15, 150, 0, day("2026-02-01"));
    expect(p.realizedLongTerm).toBe(500);
    expect(p.realizedShortTerm).toBe(150);
    expect(p.realizedPL).toBe(650);
  });

  it("nets sale fees out of the proceeds and the profit", () => {
    const l = lot({ _id: "A", qty: 10, buyPrice: 100, fees: 20, buyDate: "2025-01-10" });
    const p = previewFifo([l], 10, 150, 30, day("2026-08-01"));
    expect(p.costBasis).toBe(1020);
    expect(p.proceeds).toBe(1470);
    expect(p.realizedPL).toBe(450);
  });

  it("reports a shortfall rather than over-allocating", () => {
    expect(previewFifo([lotA], 25, 200, 0, day("2026-08-01")).shortfall).toBe(15);
  });

  it("flags a short-term slice that is nearly long-term", () => {
    // Bought 1 Sep 2025 → long-term from 2 Sep 2026. Selling on 20 Aug 2026 is
    // 13 days early, which is exactly the advice worth surfacing.
    const soon = lot({ _id: "S", qty: 10, buyPrice: 100, buyDate: "2025-09-01" });
    expect(previewFifo([soon], 10, 150, 0, day("2026-08-20")).nearlyLongTerm).toBe(13);
  });

  it("stays silent when the wait would be too long to be useful advice", () => {
    const fresh = lot({ _id: "F", qty: 10, buyPrice: 100, buyDate: "2026-07-01" });
    expect(previewFifo([fresh], 10, 150, 0, day("2026-08-01")).nearlyLongTerm).toBeNull();
  });

  it("stays silent when nothing in the sale is short-term", () => {
    const old = lot({ _id: "O", qty: 10, buyPrice: 100, buyDate: "2024-01-01" });
    expect(previewFifo([old], 10, 150, 0, day("2026-08-01")).nearlyLongTerm).toBeNull();
  });

  it("does not mutate the lots it was given", () => {
    const lots = [lot({ _id: "A", qty: 10 })];
    previewFifo(lots, 10, 150, 0, day("2026-08-01"));
    expect(lots[0].qtyRemaining).toBe(10);
  });
});
