import type { GainType, StockLot } from "@/lib/types";

/**
 * Client-side mirror of the server's FIFO allocation and capital-gains rules
 * (server/src/services/portfolioService.ts). It exists so the sell dialog can
 * show what a sale will realize *before* it is committed — including how much of
 * the gain lands as long-term, which is the difference between two tax rates.
 *
 * The server remains authoritative: this only previews. But the two must agree,
 * or the preview is a lie — so both implement the same rules and both are tested
 * against the same worked examples.
 */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

const DAY_MS = 86_400_000;

/**
 * The first day a lot counts as long-term. Listed equity is short-term when held
 * for "not more than" 12 months, so the anniversary itself is still short-term
 * and the day after is the first long-term day.
 */
export function longTermFrom(buyDate: Date): Date {
  const anniversary = new Date(startOfDay(buyDate));
  anniversary.setMonth(anniversary.getMonth() + 12);
  return new Date(anniversary.getTime() + DAY_MS);
}

export function gainTypeFor(buyDate: Date, sellDate: Date): GainType {
  return startOfDay(sellDate) >= longTermFrom(buyDate) ? "LTCG" : "STCG";
}

/** Whole days until a lot turns long-term; 0 once it already has. */
export function daysToLongTerm(buyDate: Date, now: Date): number {
  const diff = longTermFrom(buyDate).getTime() - startOfDay(now).getTime();
  return diff <= 0 ? 0 : Math.ceil(diff / DAY_MS);
}

/** Cost of `qty` shares from a lot, including their pro-rata share of its fees. */
export function costBasisFor(lot: StockLot, qty: number): number {
  const feeShare = lot.qty > 0 ? (lot.fees * qty) / lot.qty : 0;
  return round2(qty * lot.buyPrice + feeShare);
}

export interface PreviewAllocation {
  lotId: string;
  qty: number;
  costBasis: number;
  buyDate: string;
  gainType: GainType;
  daysToLongTerm: number;
}

export interface FifoPreview {
  allocations: PreviewAllocation[];
  proceeds: number;
  costBasis: number;
  realizedPL: number;
  realizedShortTerm: number;
  realizedLongTerm: number;
  /** Quantity that couldn't be matched — the sale would be rejected. */
  shortfall: number;
  /**
   * Days until the soonest short-term slice in this sale would turn long-term,
   * when that is close enough to be worth waiting for. null when nothing in the
   * sale is short-term, or the wait is too long to be useful advice.
   */
  nearlyLongTerm: number | null;
}

/** How near a short-term slice must be to long-term before we say so. */
const NEARLY_LONG_TERM_DAYS = 45;

/**
 * Preview a sale: which lots it consumes (oldest first) and what it realizes.
 * Sale fees are apportioned across the slices by quantity, so a mixed short/long
 * sale splits them proportionally rather than loading them onto the first lot.
 */
export function previewFifo(
  lots: StockLot[],
  qty: number,
  sellPrice: number,
  sellFees: number,
  sellDate: Date
): FifoPreview {
  const ordered = [...lots]
    .filter((l) => l.qtyRemaining > 0)
    .sort((a, b) => new Date(a.buyDate).getTime() - new Date(b.buyDate).getTime());

  const allocations: PreviewAllocation[] = [];
  let left = qty;

  for (const lot of ordered) {
    if (left <= 0) break;
    const take = Math.min(left, lot.qtyRemaining);
    const buyDate = new Date(lot.buyDate);
    allocations.push({
      lotId: lot._id,
      qty: take,
      costBasis: costBasisFor(lot, take),
      buyDate: lot.buyDate,
      gainType: gainTypeFor(buyDate, sellDate),
      daysToLongTerm: daysToLongTerm(buyDate, sellDate),
    });
    left -= take;
  }

  const totalQty = allocations.reduce((s, a) => s + a.qty, 0);
  const costBasis = round2(allocations.reduce((s, a) => s + a.costBasis, 0));

  let short = 0;
  let long = 0;
  for (const a of allocations) {
    const share = totalQty > 0 ? a.qty / totalQty : 0;
    const gain = a.qty * sellPrice - a.costBasis - sellFees * share;
    if (a.gainType === "LTCG") long += gain;
    else short += gain;
  }

  const realizedShortTerm = round2(short);
  const realizedLongTerm = round2(long);

  const soonest = allocations
    .filter((a) => a.gainType === "STCG" && a.daysToLongTerm > 0 && a.daysToLongTerm <= NEARLY_LONG_TERM_DAYS)
    .map((a) => a.daysToLongTerm)
    .sort((a, b) => a - b)[0];

  return {
    allocations,
    proceeds: round2(totalQty * sellPrice - sellFees),
    costBasis,
    realizedPL: round2(realizedShortTerm + realizedLongTerm),
    realizedShortTerm,
    realizedLongTerm,
    shortfall: left < 1e-9 ? 0 : left,
    nearlyLongTerm: soonest ?? null,
  };
}
