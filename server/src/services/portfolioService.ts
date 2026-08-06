import type { GainType } from "../models/StockSale";

/**
 * Pure portfolio arithmetic — FIFO lot allocation, the Indian long-term capital
 * gains boundary, and position valuation. No database and no network, so every
 * rule here is unit-testable in isolation (same split as planMetalGapFill in
 * metalPriceService).
 *
 * Money is rounded to paise at each boundary. Share quantities are not rounded:
 * fractional units are legitimate, and rounding them would silently lose stock.
 */

/** Round to 2 decimals, killing binary-float dust (0.1 + 0.2 → 0.3). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Midnight of a date, so comparisons are calendar-day based, not time-of-day. */
function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

const DAY_MS = 86_400_000;

/**
 * The date a lot stops being short-term. Under s.2(42A) of the Income-tax Act,
 * listed equity is short-term when held for *not more than* 12 months — so the
 * 12-month anniversary itself is still STCG, and the day after is the first LTCG
 * day. That off-by-one is the whole point of this function.
 *
 * A 29 Feb purchase has no anniversary in a non-leap year; JS rolls it to 1 March,
 * which delays long-term status by a day. Conservative in the taxpayer's favour.
 */
export function longTermFrom(buyDate: Date): Date {
  const anniversary = new Date(startOfDay(buyDate));
  anniversary.setMonth(anniversary.getMonth() + 12);
  return new Date(anniversary.getTime() + DAY_MS);
}

/** Whether a sale on `sellDate` of shares bought on `buyDate` is long-term. */
export function gainTypeFor(buyDate: Date, sellDate: Date): GainType {
  return startOfDay(sellDate) >= longTermFrom(buyDate) ? "LTCG" : "STCG";
}

/**
 * Whole days until a lot becomes long-term, or 0 if it already is. Drives the
 * "LTCG in 47 days" badge — the reason lots are tracked individually at all.
 */
export function daysToLongTerm(buyDate: Date, now: Date): number {
  const diff = longTermFrom(buyDate).getTime() - startOfDay(now).getTime();
  return diff <= 0 ? 0 : Math.ceil(diff / DAY_MS);
}

/** The subset of a lot this module needs. Mirrors StockLot's numeric fields. */
export interface LotLike {
  id: string;
  qty: number; // originally bought — the denominator for pro-rata fees
  qtyRemaining: number;
  buyPrice: number;
  buyDate: Date;
  fees: number;
}

/**
 * Cost of `qty` shares out of `lot`: the shares at their buy price, plus the
 * matching slice of the lot's fees. Fees are pro-rated by quantity so selling
 * half a lot carries half its brokerage — otherwise the first partial sale would
 * absorb all of it and overstate that sale's loss.
 */
export function costBasisFor(lot: LotLike, qty: number): number {
  const feeShare = lot.qty > 0 ? (lot.fees * qty) / lot.qty : 0;
  return round2(qty * lot.buyPrice + feeShare);
}

export interface Allocation {
  lot: string;
  qty: number;
  costBasis: number;
  buyDate: Date;
  gainType: GainType;
}

export interface FifoResult {
  allocations: Allocation[];
  /** Quantity that could not be matched — the caller rejects a sale with any. */
  shortfall: number;
}

/**
 * Match a sale against open lots oldest-first (FIFO). Indian brokers report on a
 * FIFO basis, so this determines both which cost basis applies and — because
 * older lots go first — how much of the gain is long-term.
 *
 * Pure: it neither mutates the lots nor assumes they are sorted.
 */
export function allocateFifo(lots: LotLike[], qty: number, sellDate: Date): FifoResult {
  const ordered = [...lots]
    .filter((l) => l.qtyRemaining > 0)
    .sort((a, b) => a.buyDate.getTime() - b.buyDate.getTime());

  const allocations: Allocation[] = [];
  let left = qty;

  for (const lot of ordered) {
    if (left <= 0) break;
    const take = Math.min(left, lot.qtyRemaining);
    allocations.push({
      lot: lot.id,
      qty: take,
      costBasis: costBasisFor(lot, take),
      buyDate: lot.buyDate,
      gainType: gainTypeFor(lot.buyDate, sellDate),
    });
    left -= take;
  }

  // Float dust from fractional quantities must not read as a real shortfall.
  return { allocations, shortfall: left < 1e-9 ? 0 : left };
}

export interface RealizedResult {
  realizedPL: number;
  realizedShortTerm: number;
  realizedLongTerm: number;
  costBasis: number;
  proceeds: number;
}

/**
 * Profit on a sale: proceeds less the cost of the shares sold, less the fees paid
 * to sell. Split by holding period, because the two halves are taxed differently.
 *
 * Sale fees are apportioned across the allocations by cost so a mixed STCG/LTCG
 * sale attributes them proportionally rather than dumping them on whichever slice
 * happens to be first.
 */
export function realizedFor(
  allocations: Allocation[],
  sellPrice: number,
  sellFees: number
): RealizedResult {
  const totalQty = allocations.reduce((s, a) => s + a.qty, 0);
  const costBasis = round2(allocations.reduce((s, a) => s + a.costBasis, 0));
  const proceeds = round2(totalQty * sellPrice);

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
  return {
    realizedPL: round2(realizedShortTerm + realizedLongTerm),
    realizedShortTerm,
    realizedLongTerm,
    costBasis,
    proceeds: round2(proceeds - sellFees),
  };
}

export interface PositionValue {
  qty: number;
  /** What the remaining shares cost, including their share of buy fees. */
  investedCost: number;
  avgCost: number;
  marketValue: number;
  unrealized: number;
  unrealizedPct: number;
}

/**
 * Value the open lots of one symbol at `price`. A missing price (upstream down
 * and nothing stored yet) values the position at cost rather than at zero — a
 * fetch failure must never read as "your shares are worthless".
 */
export function valuePosition(lots: LotLike[], price: number | null): PositionValue {
  const open = lots.filter((l) => l.qtyRemaining > 0);
  const qty = open.reduce((s, l) => s + l.qtyRemaining, 0);
  const investedCost = round2(open.reduce((s, l) => s + costBasisFor(l, l.qtyRemaining), 0));

  if (qty <= 0) {
    return { qty: 0, investedCost: 0, avgCost: 0, marketValue: 0, unrealized: 0, unrealizedPct: 0 };
  }

  const marketValue = price != null && price > 0 ? round2(qty * price) : investedCost;
  const unrealized = round2(marketValue - investedCost);
  return {
    qty,
    investedCost,
    avgCost: round2(investedCost / qty),
    marketValue,
    unrealized,
    unrealizedPct: investedCost > 0 ? round2((unrealized / investedCost) * 100) : 0,
  };
}
