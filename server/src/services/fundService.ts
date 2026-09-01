import { Types } from "mongoose";
import { Account } from "../models/Account";
import { Transaction } from "../models/Transaction";
import { Fund } from "../models/Fund";
import { FundLot } from "../models/FundLot";
import { FundRedemption } from "../models/FundRedemption";
import { getFundByCode, getNavs } from "./navService";
import { ensureGainCategory, ensureSecuritiesAccount } from "./stockService";
import {
  allocateFifo,
  realizedFor,
  round2,
  roundQty,
  valuePosition,
  daysToLongTerm,
  type LotLike,
} from "./portfolioService";
import { HttpError } from "../middleware/errorHandler";

/**
 * Mutual-fund holdings: purchases as lots, redemptions FIFO across them, and the
 * ledger legs that keep cash and the Securities bucket honest.
 *
 * Deliberately close to stockService, because the accounting is the same — the
 * differences are all real ones. Units are fractional (₹5,000 buys 11.284 of
 * them), a fund needs no demat account (money can come from any account, and the
 * folio is just a label), and the price is a once-a-day NAV rather than a live
 * quote. The FIFO and holding-period arithmetic is shared outright with equities
 * via portfolioService.
 */

/** The subset of a fund lot the pure arithmetic needs. Units play the qty role. */
function toLotLike(lot: {
  _id: unknown;
  units: number;
  unitsRemaining: number;
  buyNav: number;
  buyDate: Date;
  fees?: number | null;
}): LotLike {
  return {
    id: String(lot._id),
    qty: lot.units,
    qtyRemaining: lot.unitsRemaining,
    buyPrice: lot.buyNav,
    buyDate: new Date(lot.buyDate),
    fees: lot.fees ?? 0,
  };
}

/** The user's own account, or 404 — money has to come from somewhere real. */
async function requireAccount(uid: string, accountId: unknown): Promise<Types.ObjectId> {
  const account = await Account.findOne({ _id: accountId, user: uid }).select("_id").lean();
  if (!account) throw new HttpError(404, "Account not found");
  return account._id as Types.ObjectId;
}

/** The scheme, or 404. Refreshes the universe once before giving up. */
async function requireFund(schemeCode: string) {
  const fund = await getFundByCode(schemeCode);
  if (!fund) throw new HttpError(404, "That fund isn't in the AMFI list", "FUND_NOT_FOUND");
  return fund;
}

export interface BuyFundInput {
  schemeCode: string;
  /** Where the money came from. Any account — a bank, or demat cash. */
  account: string;
  /** Either the rupees invested, or the units allotted; the other is derived. */
  amount?: number;
  units?: number;
  /** NAV at allotment. Defaults to the fund's latest published NAV. */
  nav?: number;
  buyDate: Date;
  fees: number;
  folio: string;
  note: string;
  /**
   * Whether to move cash out of `account`. False for units bought before
   * tracking started here — inventing that payment would corrupt the account's
   * history (mirrors buyStock's recordCash).
   */
  recordCash: boolean;
  /** The SIP rule that produced this installment, if any. */
  sip?: unknown;
  /** Stamped on the ledger leg so the rule's own history shows the purchase. */
  recurring?: unknown;
}

/**
 * Record a purchase: one lot, plus the ledger leg moving its cost into the
 * Securities bucket. Net worth falls by exactly the charges — the cash is gone
 * and the units are worth what was paid for them.
 */
export async function buyFund(uid: string, input: BuyFundInput) {
  const fund = await requireFund(input.schemeCode);
  const account = await requireAccount(uid, input.account);

  const nav = input.nav && input.nav > 0 ? input.nav : fund.nav;
  if (!nav || nav <= 0) {
    throw new HttpError(400, "That fund has no published NAV yet", "FUND_NO_NAV");
  }

  // A SIP buys "₹5,000 worth"; a manual entry from a statement usually knows the
  // units. Accept either and derive the other at the NAV used.
  const units = roundQty(input.units && input.units > 0 ? input.units : (input.amount ?? 0) / nav);
  if (!units || units <= 0) throw new HttpError(400, "Enter an amount or a number of units", "FUND_NO_UNITS");

  const securities = await ensureSecuritiesAccount(uid);
  const costBasis = round2(units * nav + input.fees);

  const lot = await FundLot.create({
    user: uid,
    fund: fund._id,
    schemeCode: fund.schemeCode,
    units,
    unitsRemaining: units,
    buyNav: nav,
    buyDate: input.buyDate,
    fees: input.fees,
    folio: input.folio,
    note: input.note,
    status: "open",
    sip: input.sip ?? null,
    navDate: fund.navDate ?? null,
  });

  if (input.recordCash) {
    const tx = await Transaction.create({
      user: uid,
      type: "transfer",
      amount: costBasis,
      account,
      toAccount: securities,
      date: input.buyDate,
      note: input.note || `Bought ${units} units of ${fund.name}`,
      payee: fund.name,
      fundLot: lot._id,
      fundCostBasis: costBasis,
      recurring: input.recurring ?? null,
    });
    lot.buyTransaction = tx._id;
    await lot.save();
  } else {
    // No cash moved, but the bucket must still carry this lot's cost so a later
    // redemption has capital to return (mirrors buyStock).
    await Account.updateOne({ _id: securities }, { $inc: { initialBalance: costBasis } });
  }

  return lot.toObject();
}

export interface RedeemFundInput {
  schemeCode: string;
  /** Where the proceeds land. */
  account: string;
  units: number;
  /** NAV at redemption. Defaults to the latest published one. */
  nav?: number;
  sellDate: Date;
  /** Exit load and any charge the AMC deducted. */
  fees: number;
  note: string;
}

/**
 * Redeem units, FIFO across the lots that hold them: the oldest units go first,
 * which is both the AMC's own convention and what the holding-period arithmetic
 * assumes.
 */
export async function redeemFund(uid: string, input: RedeemFundInput) {
  const fund = await requireFund(input.schemeCode);
  const account = await requireAccount(uid, input.account);
  const nav = input.nav && input.nav > 0 ? input.nav : fund.nav;
  if (!nav || nav <= 0) throw new HttpError(400, "That fund has no published NAV yet", "FUND_NO_NAV");

  const lots = await FundLot.find({ user: uid, schemeCode: input.schemeCode, unitsRemaining: { $gt: 0 } })
    .sort({ buyDate: 1 })
    .lean();

  const { allocations, shortfall } = allocateFifo(lots.map(toLotLike), input.units, input.sellDate);
  if (shortfall > 0) {
    const held = roundQty(lots.reduce((s, l) => s + l.unitsRemaining, 0));
    throw new HttpError(400, `You only hold ${held} unit(s) of ${fund.name}`, "FUND_INSUFFICIENT_UNITS", {
      held,
      name: fund.name,
    });
  }

  const realized = realizedFor(allocations, nav, input.fees);
  const securities = await ensureSecuritiesAccount(uid);

  const redemption = await FundRedemption.create({
    user: uid,
    fund: fund._id,
    schemeCode: fund.schemeCode,
    account,
    units: input.units,
    sellNav: nav,
    sellDate: input.sellDate,
    fees: input.fees,
    note: input.note,
    allocations: allocations.map((a) => ({
      lot: a.lot,
      units: a.qty,
      costBasis: a.costBasis,
      buyDate: a.buyDate,
      gainType: a.gainType,
    })),
    realizedPL: realized.realizedPL,
  });

  // Draw down exactly the lots this redemption consumed; the stored allocations
  // are what a delete puts back.
  for (const a of allocations) {
    const lot = await FundLot.findOne({ _id: a.lot, user: uid });
    if (!lot) continue;
    lot.unitsRemaining = roundQty(lot.unitsRemaining - a.qty);
    if (lot.unitsRemaining <= 0) {
      lot.unitsRemaining = 0;
      lot.status = "closed";
    }
    await lot.save();
  }

  // Leg 1 — capital returned from the Securities bucket to the receiving account.
  const capitalTx = await Transaction.create({
    user: uid,
    type: "transfer",
    amount: realized.costBasis,
    account: securities,
    toAccount: account,
    date: input.sellDate,
    note: input.note || `Redeemed ${input.units} units of ${fund.name}`,
    payee: fund.name,
    fundRedemption: redemption._id,
    fundCostBasis: realized.costBasis,
  });
  redemption.sellTransaction = capitalTx._id;

  // Leg 2 — the gain or loss. Skipped when a redemption breaks exactly even.
  if (Math.abs(realized.realizedPL) >= 0.01) {
    const isGain = realized.realizedPL > 0;
    const category = await ensureGainCategory(uid, isGain ? "gain" : "loss");
    await Transaction.create({
      user: uid,
      type: isGain ? "income" : "expense",
      amount: Math.abs(realized.realizedPL),
      account,
      category,
      date: input.sellDate,
      note: `${isGain ? "Gain" : "Loss"} on ${fund.name}`,
      payee: fund.name,
      fundRedemption: redemption._id,
      fundRealized: realized.realizedPL,
    });
  }

  await redemption.save();
  return redemption.toObject();
}

/** Undo a redemption: put back exactly what each lot gave up, drop both legs. */
export async function deleteRedemption(uid: string, id: string) {
  const redemption = await FundRedemption.findOne({ _id: id, user: uid });
  if (!redemption) throw new HttpError(404, "Redemption not found", "FUND_REDEMPTION_NOT_FOUND");

  for (const a of redemption.allocations) {
    const lot = await FundLot.findOne({ _id: a.lot, user: uid });
    if (!lot) continue;
    lot.unitsRemaining = roundQty(Math.min(lot.units, lot.unitsRemaining + a.units));
    lot.status = lot.unitsRemaining > 0 ? "open" : "closed";
    await lot.save();
  }

  await Transaction.deleteMany({ user: uid, fundRedemption: redemption._id });
  await redemption.deleteOne();
}

/** Remove a purchase. Refused once any of its units have been redeemed. */
export async function deleteLot(uid: string, id: string) {
  const lot = await FundLot.findOne({ _id: id, user: uid });
  if (!lot) throw new HttpError(404, "Purchase not found", "FUND_LOT_NOT_FOUND");
  if (roundQty(lot.unitsRemaining) < roundQty(lot.units)) {
    throw new HttpError(
      400,
      "Some of these units have been redeemed. Delete those redemptions first.",
      "FUND_LOT_PARTLY_REDEEMED"
    );
  }

  if (lot.buyTransaction) {
    await Transaction.deleteMany({ user: uid, fundLot: lot._id });
  } else {
    // Opening-balance lot: unwind the bump made to the bucket when it was added.
    const securities = await ensureSecuritiesAccount(uid);
    await Account.updateOne(
      { _id: securities },
      { $inc: { initialBalance: -round2(lot.units * lot.buyNav + (lot.fees ?? 0)) } }
    );
  }
  await lot.deleteOne();
}

export interface FundPosition {
  schemeCode: string;
  name: string;
  fundHouse: string;
  plan: string;
  option: string;
  kind: string;
  folios: string[];
  units: number;
  avgNav: number;
  invested: number;
  nav: number;
  navDate: Date | null;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPct: number;
  /** Units still inside the 12-month window, and when the nearest one leaves it. */
  shortTermUnits: number;
  daysToLongTerm: number | null;
  lots: {
    id: string;
    units: number;
    unitsRemaining: number;
    buyNav: number;
    buyDate: Date;
    fees: number;
    folio: string;
    sip: boolean;
    daysToLongTerm: number;
  }[];
}

export interface FundPortfolio {
  positions: FundPosition[];
  invested: number;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPct: number;
  realizedPL: number;
  /** True when no NAV has been published for at least one holding. */
  stale: boolean;
}

/** Everything the Funds page shows: positions, totals and realised gains. */
export async function getFundPortfolio(uid: string, now = new Date()): Promise<FundPortfolio> {
  const lots = await FundLot.find({ user: uid, unitsRemaining: { $gt: 0 } }).sort({ buyDate: 1 }).lean();
  const codes = [...new Set(lots.map((l) => l.schemeCode))];
  const [navs, funds, redemptions] = await Promise.all([
    getNavs(codes),
    Fund.find({ schemeCode: { $in: codes } }).lean(),
    FundRedemption.find({ user: uid }).select("realizedPL").lean(),
  ]);
  const byCode = new Map(funds.map((f) => [f.schemeCode, f]));

  const positions: FundPosition[] = [];
  let stale = false;
  for (const code of codes) {
    const group = lots.filter((l) => l.schemeCode === code);
    const fund = byCode.get(code);
    const priced = navs.get(code);
    if (!priced?.nav) stale = true;

    const valued = valuePosition(group.map(toLotLike), priced?.nav ?? null);
    const shortTerm = group.filter((l) => daysToLongTerm(new Date(l.buyDate), now) > 0);
    const nearest = shortTerm
      .map((l) => daysToLongTerm(new Date(l.buyDate), now))
      .sort((a, b) => a - b)[0];

    positions.push({
      schemeCode: code,
      name: fund?.name ?? code,
      fundHouse: fund?.fundHouse ?? "",
      plan: fund?.plan ?? "",
      option: fund?.option ?? "",
      kind: fund?.kind ?? "other",
      folios: [...new Set(group.map((l) => l.folio).filter(Boolean))] as string[],
      units: valued.qty,
      avgNav: valued.avgCost,
      invested: valued.investedCost,
      nav: priced?.nav ?? 0,
      navDate: priced?.navDate ?? null,
      marketValue: valued.marketValue,
      unrealizedPL: valued.unrealized,
      unrealizedPct: valued.unrealizedPct,
      shortTermUnits: roundQty(shortTerm.reduce((s, l) => s + l.unitsRemaining, 0)),
      daysToLongTerm: nearest ?? null,
      lots: group.map((l) => ({
        id: String(l._id),
        units: l.units,
        unitsRemaining: l.unitsRemaining,
        buyNav: l.buyNav,
        buyDate: new Date(l.buyDate),
        fees: l.fees ?? 0,
        folio: l.folio ?? "",
        sip: Boolean(l.sip),
        daysToLongTerm: daysToLongTerm(new Date(l.buyDate), now),
      })),
    });
  }

  positions.sort((a, b) => b.marketValue - a.marketValue);
  const invested = round2(positions.reduce((s, p) => s + p.invested, 0));
  const marketValue = round2(positions.reduce((s, p) => s + p.marketValue, 0));
  const unrealizedPL = round2(marketValue - invested);

  return {
    positions,
    invested,
    marketValue,
    unrealizedPL,
    unrealizedPct: invested > 0 ? round2((unrealizedPL / invested) * 100) : 0,
    realizedPL: round2(redemptions.reduce((s, r) => s + (r.realizedPL ?? 0), 0)),
    stale,
  };
}

/** Market value of every open fund lot — the figure net worth adds. */
export async function fundsMarketValue(uid: string): Promise<number> {
  const lots = await FundLot.find({ user: uid, unitsRemaining: { $gt: 0 } }).lean();
  if (!lots.length) return 0;
  const navs = await getNavs([...new Set(lots.map((l) => l.schemeCode))]);

  let total = 0;
  for (const code of new Set(lots.map((l) => l.schemeCode))) {
    const group = lots.filter((l) => l.schemeCode === code).map(toLotLike);
    total += valuePosition(group, navs.get(code)?.nav ?? null).marketValue;
  }
  return round2(total);
}

/** Redemptions newest-first, for the realised-gains ledger on the Funds page. */
export async function listRedemptions(uid: string) {
  return FundRedemption.find({ user: uid }).sort({ sellDate: -1, createdAt: -1 }).lean();
}
