import { Types } from "mongoose";
import { Account } from "../models/Account";
import { Category } from "../models/Category";
import { Transaction } from "../models/Transaction";
import { Instrument } from "../models/Instrument";
import { CorporateAction } from "../models/CorporateAction";
import { StockLot } from "../models/StockLot";
import { StockSale } from "../models/StockSale";
import { HttpError } from "../middleware/errorHandler";
import {
  backfillStockHistory,
  captureSymbolNow,
  ensureInstrument,
  getLatestPrices,
  syncSplits,
  type LatestPrice,
} from "./stockPriceService";
import {
  allocateFifo,
  daysToLongTerm,
  realizedFor,
  round2,
  roundQty,
  valuePosition,
  type LotLike,
} from "./portfolioService";

/**
 * Stock buying, selling and portfolio valuation, and the ledger entries that keep
 * them honest.
 *
 * The shape of the ledger is the whole design. A demat account's BALANCE is only
 * the idle cash sitting at the broker; the shares themselves are StockLots valued
 * at market. If a purchase simply removed cash and created a lot, the two would
 * drift — and if it removed nothing, a funded demat account would be counted
 * twice (once as cash, once as stock). So a purchase moves cash into an
 * auto-managed "Stock Investments" account holding cost basis, excluded from
 * totals because the lots already supply the market value. Net worth then moves
 * by exactly the unrealized gain, which is the truth.
 *
 * This mirrors what the Credits feature does with "Money Lent" — same problem,
 * same shape.
 */

/**
 * The auto-managed cost-basis bucket. Excluded from totals (unlike Money Lent,
 * which IS an asset) because counting both cost basis and market value would
 * double-count every position.
 *
 * Invariant: its balance equals the cost basis of every open lot. Purchases paid
 * from the demat account transfer into it; purchases of shares acquired before
 * tracking began raise its `initialBalance` instead, so the invariant holds
 * either way without inventing a cash movement that never happened.
 */
const SECURITIES_ACCOUNT = {
  system: "securities",
  name: "Stock Investments",
  type: "securities",
  icon: "trending-up",
  color: "#6366F1",
} as const;

/** Auto-managed categories for realized gains and losses. */
const GAIN_CATEGORY = {
  gain: { system: "stock_gain", name: "Capital Gains", type: "income", icon: "trending-up", color: "#10B981" },
  loss: { system: "stock_loss", name: "Capital Loss", type: "expense", icon: "trending-down", color: "#EF4444" },
} as const;

/** Find — or lazily create — the user's Securities bucket. */
export async function ensureSecuritiesAccount(uid: unknown): Promise<Types.ObjectId> {
  const existing = await Account.findOne({ user: uid, system: SECURITIES_ACCOUNT.system });
  if (existing) return existing._id as Types.ObjectId;
  const created = await Account.create({
    user: uid,
    name: SECURITIES_ACCOUNT.name,
    type: SECURITIES_ACCOUNT.type,
    icon: SECURITIES_ACCOUNT.icon,
    color: SECURITIES_ACCOUNT.color,
    system: SECURITIES_ACCOUNT.system,
    initialBalance: 0,
    // The lots carry market value into net worth. Counting this account too would
    // add the cost basis on top of it.
    includeInTotal: false,
  });
  return created._id as Types.ObjectId;
}

/** Find — or lazily create — the realized gain/loss category. */
async function ensureGainCategory(uid: unknown, kind: keyof typeof GAIN_CATEGORY): Promise<Types.ObjectId> {
  const spec = GAIN_CATEGORY[kind];
  const existing = await Category.findOne({ user: uid, system: spec.system });
  if (existing) return existing._id as Types.ObjectId;
  const created = await Category.create({
    user: uid,
    name: spec.name,
    type: spec.type,
    icon: spec.icon,
    color: spec.color,
    system: spec.system,
  });
  return created._id as Types.ObjectId;
}

/** The user's demat account, verified. Throws if it isn't one of theirs. */
async function requireDemat(uid: string, dematId: string) {
  const account = await Account.findOne({ _id: dematId, user: uid });
  if (!account) throw new HttpError(404, "Account not found", "ACCOUNT_NOT_FOUND");
  if (account.type !== "demat") {
    throw new HttpError(400, "Stocks must be held in a demat account", "STOCK_NOT_DEMAT");
  }
  return account;
}

/**
 * A stored date as its IST calendar day, so it compares directly against the
 * YYYY-MM-DD effective dates corporate actions are keyed by.
 */
function istDay(d: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(d));
}

/** Map a stored lot onto the shape the pure FIFO/valuation helpers expect. */
function toLotLike(lot: {
  _id: unknown;
  qty: number;
  qtyRemaining: number;
  buyPrice: number;
  buyDate: Date;
  fees: number;
}): LotLike {
  return {
    id: String(lot._id),
    qty: lot.qty,
    qtyRemaining: lot.qtyRemaining,
    buyPrice: lot.buyPrice,
    buyDate: new Date(lot.buyDate),
    fees: lot.fees ?? 0,
  };
}

export interface BuyInput {
  symbol: string;
  demat: string;
  qty: number;
  buyPrice: number;
  buyDate: Date;
  fees: number;
  note: string;
  /**
   * Whether the purchase should draw cash from the demat account. False for
   * shares acquired before tracking began: recording a cash movement that never
   * happened here would silently corrupt the account's history.
   */
  recordCash: boolean;
}

/**
 * Record a purchase: one lot, plus the ledger leg moving its cost from demat cash
 * into the Securities bucket.
 *
 * Net worth falls by exactly the fees — the cash is gone, the shares are worth
 * what was paid for them, and the brokerage is a real cost.
 */
export async function buyStock(uid: string, input: BuyInput) {
  const instrument = await ensureInstrument(input.symbol);
  await requireDemat(uid, input.demat);

  const securities = await ensureSecuritiesAccount(uid);
  const costBasis = round2(input.qty * input.buyPrice + input.fees);

  const lot = await StockLot.create({
    user: uid,
    instrument: instrument._id,
    symbol: instrument.symbol,
    demat: input.demat,
    qty: input.qty,
    qtyRemaining: input.qty,
    buyPrice: input.buyPrice,
    buyDate: input.buyDate,
    fees: input.fees,
    note: input.note,
    status: "open",
  });

  if (input.recordCash) {
    const tx = await Transaction.create({
      user: uid,
      type: "transfer",
      amount: costBasis,
      account: input.demat,
      toAccount: securities,
      date: input.buyDate,
      note: input.note || `Bought ${input.qty} ${instrument.ticker}`,
      payee: instrument.shortName || instrument.ticker,
      stockLot: lot._id,
      stockCostBasis: costBasis,
    });
    lot.buyTransaction = tx._id;
    await lot.save();
  } else {
    // No cash moved, but the bucket must still hold this lot's cost so the
    // sale's capital-return leg has something to draw on. Raising the opening
    // balance records that without fabricating a transaction.
    await Account.updateOne({ _id: securities }, { $inc: { initialBalance: costBasis } });
  }

  // Price it now so the position shows a live figure straight away rather than
  // sitting at cost until the next scheduled refresh, and pull in the past year
  // so its chart isn't a single point. Both are best-effort and idempotent.
  await captureSymbolNow(instrument.symbol);
  await backfillStockHistory(instrument.symbol).catch((e) =>
    console.error(`[stocks] history backfill failed for ${instrument.symbol}`, e)
  );
  // Learn this symbol's splits now rather than at the next nightly sync — a lot
  // backdated to before a split needs adjusting the moment it is entered, or the
  // position reads as a loss it never took.
  await syncSplits(instrument.symbol).catch((e) =>
    console.error(`[stocks] split sync failed for ${instrument.symbol}`, e)
  );

  return lot.toObject();
}

export interface SellInput {
  symbol: string;
  demat: string;
  qty: number;
  sellPrice: number;
  sellDate: Date;
  fees: number;
  note: string;
}

/**
 * Record a sale, consuming open lots oldest-first. Posts two ledger legs, the
 * same way a loan repayment splits principal from interest:
 *
 *   • a transfer returning the cost basis from Securities to demat cash, and
 *   • an income (or expense, on a loss) leg booking the realized gain.
 *
 * Together they move exactly the net proceeds into the demat account, and the
 * gain shows up in Reports as real income rather than appearing from nowhere.
 */
export async function sellStock(uid: string, input: SellInput) {
  const instrument = await Instrument.findOne({ symbol: input.symbol });
  if (!instrument) throw new HttpError(404, "That stock isn't in your portfolio", "STOCK_NOT_HELD");
  await requireDemat(uid, input.demat);

  const lots = await StockLot.find({ user: uid, symbol: input.symbol, qtyRemaining: { $gt: 0 } })
    .sort({ buyDate: 1 })
    .lean();

  const { allocations, shortfall } = allocateFifo(lots.map(toLotLike), input.qty, input.sellDate);
  if (shortfall > 0) {
    const held = lots.reduce((s, l) => s + l.qtyRemaining, 0);
    throw new HttpError(
      400,
      `You only hold ${held} share(s) of ${instrument.ticker}`,
      "STOCK_INSUFFICIENT_QTY",
      { held, ticker: instrument.ticker }
    );
  }

  const realized = realizedFor(allocations, input.sellPrice, input.fees);
  const securities = await ensureSecuritiesAccount(uid);

  const sale = await StockSale.create({
    user: uid,
    instrument: instrument._id,
    symbol: instrument.symbol,
    demat: input.demat,
    qty: input.qty,
    sellPrice: input.sellPrice,
    sellDate: input.sellDate,
    fees: input.fees,
    note: input.note,
    allocations,
    realizedPL: realized.realizedPL,
    realizedShortTerm: realized.realizedShortTerm,
    realizedLongTerm: realized.realizedLongTerm,
  });

  // Draw down the lots this sale consumed. Recorded on the sale as `allocations`
  // so deleting it can put back exactly this, rather than re-running FIFO against
  // a portfolio that may have changed since.
  for (const a of allocations) {
    const lot = await StockLot.findOne({ _id: a.lot, user: uid });
    if (!lot) continue;
    lot.qtyRemaining = roundQty(lot.qtyRemaining - a.qty);
    if (lot.qtyRemaining <= 0) {
      lot.qtyRemaining = 0;
      lot.status = "closed";
    }
    await lot.save();
  }

  // Leg 1 — capital returned to the broker's cash balance.
  const capitalTx = await Transaction.create({
    user: uid,
    type: "transfer",
    amount: realized.costBasis,
    account: securities,
    toAccount: input.demat,
    date: input.sellDate,
    note: input.note || `Sold ${input.qty} ${instrument.ticker}`,
    payee: instrument.shortName || instrument.ticker,
    stockSale: sale._id,
    stockCostBasis: realized.costBasis,
  });
  sale.saleTransaction = capitalTx._id;

  // Leg 2 — the gain or loss itself. Skipped when a sale breaks exactly even.
  if (Math.abs(realized.realizedPL) >= 0.01) {
    const isGain = realized.realizedPL > 0;
    const category = await ensureGainCategory(uid, isGain ? "gain" : "loss");
    const gainTx = await Transaction.create({
      user: uid,
      type: isGain ? "income" : "expense",
      amount: Math.abs(realized.realizedPL),
      account: input.demat,
      category,
      date: input.sellDate,
      note: `${isGain ? "Gain" : "Loss"} on ${instrument.ticker}`,
      payee: instrument.shortName || instrument.ticker,
      stockSale: sale._id,
      stockRealized: realized.realizedPL,
    });
    sale.gainTransaction = gainTx._id;
  }

  await sale.save();
  return sale.toObject();
}

/**
 * Undo a sale: put back exactly the quantity each lot gave up, and remove both
 * ledger legs. Walks the stored allocations rather than recomputing FIFO —
 * recomputation drifts the moment any other lot has changed since.
 */
export async function deleteSale(uid: string, saleId: string) {
  const sale = await StockSale.findOne({ _id: saleId, user: uid });
  if (!sale) throw new HttpError(404, "Sale not found", "STOCK_SALE_NOT_FOUND");

  for (const a of sale.allocations) {
    const lot = await StockLot.findOne({ _id: a.lot, user: uid });
    if (!lot) continue;
    lot.qtyRemaining = roundQty(lot.qtyRemaining + a.qty);
    if (lot.qtyRemaining > 0) lot.status = "open";
    await lot.save();
  }

  await Transaction.deleteMany({ user: uid, stockSale: sale._id });
  await sale.deleteOne();
  return { ok: true };
}

/**
 * Delete a purchase. Refused once any of it has been sold — the sale's stored
 * allocations point at this lot, and removing it would strand them. Sell-side
 * history has to come off first.
 */
export async function deleteLot(uid: string, lotId: string) {
  const lot = await StockLot.findOne({ _id: lotId, user: uid });
  if (!lot) throw new HttpError(404, "Purchase not found", "STOCK_LOT_NOT_FOUND");
  if (lot.qtyRemaining < lot.qty) {
    throw new HttpError(
      400,
      "Some of this purchase has been sold. Delete those sales first.",
      "STOCK_LOT_PARTLY_SOLD"
    );
  }

  const costBasis = round2(lot.qty * lot.buyPrice + (lot.fees ?? 0));
  if (lot.buyTransaction) {
    await Transaction.deleteMany({ user: uid, stockLot: lot._id });
  } else {
    // Mirror of the opening-balance path in buyStock: take the cost back out of
    // the Securities bucket so its balance still equals open cost basis.
    const securities = await ensureSecuritiesAccount(uid);
    await Account.updateOne({ _id: securities }, { $inc: { initialBalance: -costBasis } });
  }

  await lot.deleteOne();
  return { ok: true };
}

export interface PortfolioPosition {
  symbol: string;
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  qty: number;
  avgCost: number;
  investedCost: number;
  price: number | null;
  priceDate: string | null;
  stale: boolean;
  dayChange: number;
  dayChangePct: number;
  marketValue: number;
  unrealized: number;
  unrealizedPct: number;
  week52High: number;
  week52Low: number;
  /** Share of the whole portfolio's market value, as a percentage. */
  allocationPct: number;
  lots: {
    _id: string;
    qty: number;
    qtyRemaining: number;
    buyPrice: number;
    buyDate: Date;
    fees: number;
    note: string;
    /** 0 once the lot has crossed the 12-month long-term line. */
    daysToLongTerm: number;
    longTerm: boolean;
  }[];
}

export interface PortfolioSummary {
  configured: boolean;
  positions: PortfolioPosition[];
  totals: {
    marketValue: number;
    investedCost: number;
    unrealized: number;
    unrealizedPct: number;
    dayChange: number;
    realizedPL: number;
    realizedShortTerm: number;
    realizedLongTerm: number;
  };
  /** Newest price timestamp across the portfolio, so the UI can say "as of …". */
  pricedAt: Date | null;
  anyStale: boolean;
}

/**
 * The user's whole portfolio, valued at the newest stored prices. Positions with
 * nothing left are dropped; the realized totals come from sales so a fully-exited
 * stock still contributes to the year's booked profit.
 */
export async function getPortfolio(uid: string, now = new Date()): Promise<PortfolioSummary> {
  const [lots, sales] = await Promise.all([
    StockLot.find({ user: uid, qtyRemaining: { $gt: 0 } }).sort({ buyDate: 1 }).lean(),
    StockSale.find({ user: uid }).lean(),
  ]);

  const symbols = [...new Set(lots.map((l) => l.symbol))];
  const [prices, instruments] = await Promise.all([
    getLatestPrices(symbols),
    Instrument.find({ symbol: { $in: symbols } }).lean(),
  ]);
  const bySymbol = new Map(instruments.map((i) => [i.symbol, i]));

  const bySym = new Map<string, typeof lots>();
  for (const lot of lots) {
    const list = bySym.get(lot.symbol) ?? [];
    list.push(lot);
    bySym.set(lot.symbol, list);
  }

  const positions: PortfolioPosition[] = [];
  for (const [symbol, group] of bySym) {
    const price: LatestPrice | undefined = prices.get(symbol);
    const lotLikes = group.map(toLotLike);
    const v = valuePosition(lotLikes, price?.close ?? null);
    if (v.qty <= 0) continue;

    const meta = bySymbol.get(symbol);
    positions.push({
      symbol,
      ticker: meta?.ticker ?? symbol,
      name: meta?.longName || meta?.shortName || symbol,
      exchange: meta?.exchange ?? "",
      sector: meta?.sector ?? "",
      qty: v.qty,
      avgCost: v.avgCost,
      investedCost: v.investedCost,
      price: price?.close ?? null,
      priceDate: price?.date ?? null,
      stale: price?.stale ?? true,
      dayChange: round2((price?.change ?? 0) * v.qty),
      dayChangePct: price?.changePct ?? 0,
      marketValue: v.marketValue,
      unrealized: v.unrealized,
      unrealizedPct: v.unrealizedPct,
      week52High: price?.week52High ?? 0,
      week52Low: price?.week52Low ?? 0,
      allocationPct: 0, // filled once the portfolio total is known
      lots: group.map((l) => ({
        _id: String(l._id),
        qty: l.qty,
        qtyRemaining: l.qtyRemaining,
        buyPrice: l.buyPrice,
        buyDate: l.buyDate,
        fees: l.fees ?? 0,
        note: l.note ?? "",
        daysToLongTerm: daysToLongTerm(new Date(l.buyDate), now),
        longTerm: daysToLongTerm(new Date(l.buyDate), now) === 0,
      })),
    });
  }

  const marketValue = round2(positions.reduce((s, p) => s + p.marketValue, 0));
  const investedCost = round2(positions.reduce((s, p) => s + p.investedCost, 0));
  const unrealized = round2(marketValue - investedCost);
  for (const p of positions) {
    p.allocationPct = marketValue > 0 ? round2((p.marketValue / marketValue) * 100) : 0;
  }
  positions.sort((a, b) => b.marketValue - a.marketValue);

  const pricedAtMs = [...prices.values()]
    .map((p) => (p.fetchedAt ? new Date(p.fetchedAt).getTime() : 0))
    .reduce((a, b) => Math.max(a, b), 0);

  return {
    configured: true,
    positions,
    totals: {
      marketValue,
      investedCost,
      unrealized,
      unrealizedPct: investedCost > 0 ? round2((unrealized / investedCost) * 100) : 0,
      dayChange: round2(positions.reduce((s, p) => s + p.dayChange, 0)),
      realizedPL: round2(sales.reduce((s, x) => s + (x.realizedPL ?? 0), 0)),
      realizedShortTerm: round2(sales.reduce((s, x) => s + (x.realizedShortTerm ?? 0), 0)),
      realizedLongTerm: round2(sales.reduce((s, x) => s + (x.realizedLongTerm ?? 0), 0)),
    },
    pricedAt: pricedAtMs ? new Date(pricedAtMs) : null,
    anyStale: positions.some((p) => p.stale),
  };
}

/**
 * Market value of every open lot — the single number net worth needs. Kept
 * separate from getPortfolio so the net-worth path stays one aggregate-shaped
 * read rather than building the full position list it would then throw away.
 */
export async function stocksMarketValue(uid: string): Promise<number> {
  const lots = await StockLot.find({ user: uid, qtyRemaining: { $gt: 0 } }).lean();
  if (!lots.length) return 0;

  const prices = await getLatestPrices([...new Set(lots.map((l) => l.symbol))]);

  const bySym = new Map<string, LotLike[]>();
  for (const lot of lots) {
    const list = bySym.get(lot.symbol) ?? [];
    list.push(toLotLike(lot));
    bySym.set(lot.symbol, list);
  }

  let total = 0;
  for (const [symbol, group] of bySym) {
    total += valuePosition(group, prices.get(symbol)?.close ?? null).marketValue;
  }
  return round2(total);
}

/** Sales newest-first, for the realized-gains ledger on the Stocks page. */
export async function listSales(uid: string) {
  const sales = await StockSale.find({ user: uid }).sort({ sellDate: -1 }).lean();
  const instruments = await Instrument.find({ symbol: { $in: sales.map((s) => s.symbol) } }).lean();
  const bySymbol = new Map(instruments.map((i) => [i.symbol, i]));
  return sales.map((s) => ({
    ...s,
    ticker: bySymbol.get(s.symbol)?.ticker ?? s.symbol,
    name: bySymbol.get(s.symbol)?.longName ?? s.symbol,
  }));
}

export interface PendingSplit {
  symbol: string;
  ticker: string;
  name: string;
  date: string;
  ratio: number;
  label: string;
  /** Lots that would be adjusted, and what they'd become. */
  lots: number;
  qtyBefore: number;
  qtyAfter: number;
}

/**
 * Splits that have happened since the user bought, and haven't been applied to
 * their lots yet.
 *
 * A split is only ever *offered*, never applied automatically. The market price
 * reflects it immediately, so an unapplied split shows up as a sudden fake loss —
 * but silently multiplying someone's share count is worse than showing them a
 * number they can question. Only splits dated after a lot's purchase apply to it:
 * buying after the ex-date already gets the adjusted price.
 */
export async function pendingSplits(uid: string): Promise<PendingSplit[]> {
  const lots = await StockLot.find({ user: uid, qtyRemaining: { $gt: 0 } }).lean();
  if (!lots.length) return [];

  const symbols = [...new Set(lots.map((l) => l.symbol))];
  const [actions, instruments] = await Promise.all([
    CorporateAction.find({ symbol: { $in: symbols } }).sort({ date: 1 }).lean(),
    Instrument.find({ symbol: { $in: symbols } }).lean(),
  ]);
  if (!actions.length) return [];
  const meta = new Map(instruments.map((i) => [i.symbol, i]));

  const out: PendingSplit[] = [];
  for (const action of actions) {
    const affected = lots.filter(
      (l) =>
        l.symbol === action.symbol &&
        !(l.splitsApplied ?? []).includes(action.date) &&
        // Bought strictly before the ex-date; a later purchase is already adjusted.
        istDay(l.buyDate) < action.date
    );
    if (!affected.length) continue;

    const qtyBefore = affected.reduce((s, l) => s + l.qtyRemaining, 0);
    out.push({
      symbol: action.symbol,
      ticker: meta.get(action.symbol)?.ticker ?? action.symbol,
      name: meta.get(action.symbol)?.longName ?? action.symbol,
      date: action.date,
      ratio: action.ratio,
      label: action.label,
      lots: affected.length,
      qtyBefore: round2(qtyBefore),
      qtyAfter: round2(qtyBefore * action.ratio),
    });
  }
  return out;
}

/**
 * Apply one split to every lot it affects: quantity multiplies, buy price
 * divides. Cost basis is deliberately unchanged — a split hands you more shares,
 * it doesn't change what you paid — so the Stock Investments bucket still matches
 * and net worth doesn't move. The purchase date is untouched too, because a split
 * doesn't restart the holding period for capital gains.
 *
 * Historical sales keep their pre-split quantities, which is what actually
 * happened. `qty` and `qtyRemaining` scale together, so the sold portion stays
 * consistent when expressed in post-split shares.
 */
export async function applySplit(uid: string, symbol: string, date: string) {
  const action = await CorporateAction.findOne({ symbol, date });
  if (!action) throw new HttpError(404, "That corporate action isn't on record", "STOCK_SPLIT_NOT_FOUND");

  const lots = await StockLot.find({ user: uid, symbol, qtyRemaining: { $gt: 0 } });
  let adjusted = 0;

  for (const lot of lots) {
    if ((lot.splitsApplied ?? []).includes(date)) continue;
    if (istDay(lot.buyDate) >= date) continue;

    lot.qty = roundQty(lot.qty * action.ratio);
    lot.qtyRemaining = roundQty(lot.qtyRemaining * action.ratio);
    lot.buyPrice = lot.buyPrice / action.ratio;
    lot.splitsApplied = [...(lot.splitsApplied ?? []), date];
    await lot.save();
    adjusted++;
  }

  return { ok: true, adjusted };
}
