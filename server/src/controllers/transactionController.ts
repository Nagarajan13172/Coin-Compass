import type { Request, Response } from "express";
import { Types } from "mongoose";
import { Transaction } from "../models/Transaction";
import { transactionSchema, transactionUpdateSchema } from "../validators/schemas";
import { balancesAsOf } from "../services/balanceService";
import { applyLoanPayment, reverseLoanPayment } from "../services/loanService";
import {
  applyGoalContribution,
  assertGoalTakesContributions,
  reverseGoalContribution,
} from "../services/goalService";
import { unlinkCreditTransaction, deleteCreditForTransaction } from "../services/creditService";
import { splitIdForTransaction, unlinkSplitForTransaction } from "../services/splitService";
import { userId } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

const POPULATE = [
  { path: "account", select: "name color icon currency" },
  { path: "toAccount", select: "name color icon currency" },
  { path: "category", select: "name color icon type" },
  { path: "loan", select: "name" },
  { path: "goal", select: "name color icon" },
  // `split` on the credit too: a participant's transfer leg reaches its shared bill
  // through the credit, and the ledger needs it to collapse the bill into one row.
  { path: "credit", select: "person direction split" },
  { path: "split", select: "description totalAmount yourShare" },
];

/**
 * Ledger legs owned by a stock purchase or sale. They exist to keep demat cash
 * and the Stock Investments bucket in step with the lots, so they are managed
 * from the Stocks page — never edited or deleted as loose transactions here.
 */
function isStockLinked(txn: { stockLot?: unknown; stockSale?: unknown }): boolean {
  return Boolean(txn.stockLot || txn.stockSale);
}

/** Refuse to touch a stock leg, naming the record that actually owns it. */
function assertNotStockLinked(
  txn: { stockLot?: unknown; stockSale?: unknown },
  action: "delete" | "edit"
): void {
  if (!isStockLinked(txn)) return;
  const owner = txn.stockLot ? "purchase" : "sale";
  throw new HttpError(
    400,
    `This is part of a stock ${owner}. ${action === "delete" ? "Delete" : "Edit"} the ${owner} from the Stocks page instead.`,
    txn.stockLot
      ? action === "delete" ? "TXN_STOCK_LOT_DELETE" : "TXN_STOCK_LOT_EDIT"
      : action === "delete" ? "TXN_STOCK_SALE_DELETE" : "TXN_STOCK_SALE_EDIT"
  );
}

/**
 * Allow harmless edits to a stock leg (a note, a tag) but refuse anything that
 * would move money — the amounts are derived from the lot's cost basis and the
 * sale's realized gain, so changing one here desynchronises it from the shares.
 */
function assertStockLegUnchanged(
  txn: { stockLot?: unknown; stockSale?: unknown; amount: number; type: string; account: unknown; toAccount?: unknown },
  patch: Record<string, unknown>
): void {
  if (!isStockLinked(txn)) return;

  const sameId = (a: unknown, b: unknown) => b === undefined || String(a ?? "") === String(b ?? "");
  const untouched =
    (patch.amount === undefined || patch.amount === txn.amount) &&
    (patch.type === undefined || patch.type === txn.type) &&
    sameId(txn.account, patch.account) &&
    sameId(txn.toAccount, patch.toAccount);

  if (!untouched) assertNotStockLinked(txn, "edit");
}

/** Accept a single value or a comma-separated list ("a,b" → { $in: ["a","b"] }). */
function oneOrMany(value: unknown): unknown {
  const parts = String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 1 ? { $in: parts } : parts[0];
}

/**
 * `castId` converts id strings to ObjectIds. `.find()` does that itself from the
 * schema, so it passes nothing; an aggregate `$match` doesn't, so the summary
 * pipeline passes `castIdFilter`.
 *
 * Account and search each need an `$or`, so both go into `$and` rather than
 * fighting over the single top-level `$or` key.
 */
function buildFilter(
  query: Request["query"],
  castId: (value: unknown) => unknown = (v) => v
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  const and: Record<string, unknown>[] = [];

  if (query.account) {
    const ids = castId(oneOrMany(query.account));
    // A transfer INTO the account names it on `toAccount` — a credit settlement
    // landing back in your bank, or the receiving side of a self-transfer.
    // Matching only `account` would drop those from the account's own ledger.
    and.push({ $or: [{ account: ids }, { toAccount: ids }] });
  }
  if (query.category) filter.category = castId(query.category);
  if (query.type) filter.type = oneOrMany(query.type);
  // A single tag matches array membership; a comma-separated list becomes $in (any of).
  if (query.tag) filter.tags = oneOrMany(query.tag);
  // Drill-in to just the irregular / one-off spends (e.g. from the summary rail).
  if (query.oneoff === "1" || query.oneoff === "true") filter.oneoff = true;

  if (query.from || query.to) {
    const date: Record<string, Date> = {};
    if (query.from) date.$gte = new Date(String(query.from));
    if (query.to) date.$lt = new Date(String(query.to));
    filter.date = date;
  }

  if (query.search) {
    const rx = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    and.push({ $or: [{ note: rx }, { payee: rx }, { tags: rx }] });
  }

  if (and.length) filter.$and = and;
  return filter;
}

/** Cast a single id or `{ $in: [...] }` of ids from strings to ObjectIds, skipping
 *  invalid ones. `.find()` casts these automatically from the schema, but an
 *  aggregate `$match` does not — so the summary pipeline needs it done by hand. */
function castIdFilter(value: unknown): unknown {
  if (value && typeof value === "object" && "$in" in (value as Record<string, unknown>)) {
    const ids = (value as { $in: unknown[] }).$in
      .map(String)
      .filter((s) => Types.ObjectId.isValid(s))
      .map((s) => new Types.ObjectId(s));
    return { $in: ids };
  }
  const s = String(value);
  return Types.ObjectId.isValid(s) ? new Types.ObjectId(s) : value;
}

/** buildFilter, but with the ObjectId fields cast for an aggregation pipeline and
 *  scoped to the user. */
function buildMatch(query: Request["query"], uid: string): Record<string, unknown> {
  return { ...buildFilter(query, castIdFilter), user: new Types.ObjectId(uid) };
}

export async function listTransactions(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
  const filter = { ...buildFilter(req.query), user: userId(req) };

  const [items, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(POPULATE)
      .lean(),
    Transaction.countDocuments(filter),
  ]);

  res.json({
    items,
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    hasMore: page * limit < total,
  });
}

/**
 * In / out / net totals for a *filtered* slice of the ledger — the same filters
 * the list accepts (account, category, type, tag, one-off, date range, search).
 * The list is paginated, so the client can't just sum the loaded rows; this runs
 * one aggregation over the whole matching set. Transfers move money between the
 * user's own accounts, so they count toward neither in nor out (matching the
 * /reports summary); `count` still reflects every matched row so it lines up with
 * the list's total.
 */
export async function transactionsSummary(req: Request, res: Response) {
  const match = buildMatch(req.query, userId(req));
  const [agg] = await Transaction.aggregate<{
    income: number;
    expense: number;
    incomeCount: number;
    expenseCount: number;
    count: number;
  }>([
    { $match: match },
    {
      $group: {
        _id: null,
        income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
        expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } },
        incomeCount: { $sum: { $cond: [{ $eq: ["$type", "income"] }, 1, 0] } },
        expenseCount: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, 1, 0] } },
        count: { $sum: 1 },
      },
    },
  ]);

  const income = agg?.income ?? 0;
  const expense = agg?.expense ?? 0;
  res.json({
    income,
    expense,
    net: income - expense,
    incomeCount: agg?.incomeCount ?? 0,
    expenseCount: agg?.expenseCount ?? 0,
    count: agg?.count ?? 0,
  });
}

/**
 * Balances as of an instant (`?asOf=<ISO>`, exclusive), or right now when
 * omitted: the grand total plus a per-account breakdown. The Transactions page
 * uses these to anchor the per-day "end-of-day balance" — it needs one anchor
 * per account so a day that touched two accounts can show where each one
 * landed, and it needs them as of the window's end so a past month reads the
 * balances as they stood then rather than today's.
 */
export async function ledgerBalance(req: Request, res: Response) {
  const asOfRaw = req.query.asOf ? new Date(String(req.query.asOf)) : undefined;
  const asOf = asOfRaw && !Number.isNaN(asOfRaw.getTime()) ? asOfRaw : undefined;
  const { total, byAccount } = await balancesAsOf(userId(req), asOf);
  res.json({ balance: total, byAccount });
}

/** Distinct tags the user has applied across their transactions, with usage counts
 *  (most-used first) — powers the Transactions page tag filter. */
export async function listTags(req: Request, res: Response) {
  const rows = await Transaction.aggregate<{ _id: string; count: number }>([
    { $match: { user: new Types.ObjectId(userId(req)) } },
    { $unwind: "$tags" },
    { $group: { _id: "$tags", count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]);
  res.json(rows.map((r) => ({ tag: r._id, count: r.count })));
}

export async function getTransaction(req: Request, res: Response) {
  const txn = await Transaction.findOne({ _id: req.params.id, user: userId(req) })
    .populate(POPULATE)
    .lean();
  if (!txn) throw new HttpError(404, "Transaction not found");
  res.json(txn);
}

export async function createTransaction(req: Request, res: Response) {
  const uid = userId(req);
  const data = transactionSchema.parse(req.body);
  if (data.type !== "transfer") data.toAccount = null;
  if (data.type === "transfer") data.category = null;
  await assertGoalTakesContributions(data.goal, uid);
  const txn = await Transaction.create({ ...data, user: uid });
  let touched = false;
  // Linked to a loan → principal reduces the balance, interest is tracked separately.
  if (txn.loan) {
    const { principal, interest } = await applyLoanPayment(txn.loan, uid, txn.amount);
    txn.loanPrincipal = principal;
    txn.loanInterest = interest;
    touched = true;
  }
  // Linked to a goal → the amount is added to the goal's saved total; store how much
  // was applied so an edit/delete can reverse it exactly.
  if (txn.goal) {
    txn.goalContribution = await applyGoalContribution(txn.goal, uid, txn.amount);
    touched = true;
  }
  if (touched) await txn.save();
  const populated = await txn.populate(POPULATE);
  res.status(201).json(populated);
}

export async function updateTransaction(req: Request, res: Response) {
  const uid = userId(req);
  const data = transactionUpdateSchema.parse(req.body);
  if (data.type && data.type !== "transfer") data.toAccount = null;
  if (data.type === "transfer") data.category = null;

  const txn = await Transaction.findOne({ _id: req.params.id, user: uid });
  if (!txn) throw new HttpError(404, "Transaction not found");

  assertStockLegUnchanged(txn, data);
  if (data.goal !== undefined) await assertGoalTakesContributions(data.goal, uid);

  const prevLoan = txn.loan;
  const prevPrincipal = txn.loanPrincipal ?? 0;
  const prevInterest = txn.loanInterest ?? 0;
  const prevGoal = txn.goal;
  const prevGoalContribution = txn.goalContribution ?? 0;
  const prevCredit = txn.credit;
  // Resolved before the patch is applied, and via the credit for participant legs.
  const prevSplit = await splitIdForTransaction(uid, txn);
  Object.assign(txn, data);

  // Guard the transfer invariants on the *effective* transaction — the update
  // schema can't, since a PATCH may change only one side (e.g. flip type to
  // transfer while keeping the existing account). Without this, an edit can create
  // a same-account or destination-less transfer that leaks money.
  if (txn.type === "transfer") {
    if (!txn.toAccount) throw new HttpError(400, "Transfers require a destination account");
    if (String(txn.account) === String(txn.toAccount)) {
      throw new HttpError(400, "Source and destination accounts must differ");
    }
  }

  // Reconcile: undo the previous payment (principal + interest), then apply the new
  // one fresh (recomputing on the restored balance). Handles amount changes,
  // re-linking to a different loan, or clearing the link.
  if (prevLoan) await reverseLoanPayment(prevLoan, uid, prevPrincipal, prevInterest);
  if (txn.loan) {
    const { principal, interest } = await applyLoanPayment(txn.loan, uid, txn.amount);
    txn.loanPrincipal = principal;
    txn.loanInterest = interest;
  } else {
    txn.loanPrincipal = 0;
    txn.loanInterest = 0;
  }

  // Same reconcile for a linked goal: undo the previous contribution, then re-apply
  // on the new amount (handles amount changes, re-linking, or clearing the goal).
  if (prevGoal) await reverseGoalContribution(prevGoal, uid, prevGoalContribution);
  if (txn.goal) {
    txn.goalContribution = await applyGoalContribution(txn.goal, uid, txn.amount);
  } else {
    txn.goalContribution = 0;
  }

  // A credit's reflected transactions are managed from the Credits page (a credit
  // can map to a transfer plus an income leg). Editing one directly here detaches
  // the whole credit's reflection — its other leg is removed and the credit stays
  // as a pure ledger entry, while THIS transaction becomes standalone.
  if (prevCredit) {
    txn.credit = null;
    await unlinkCreditTransaction(uid, prevCredit, txn._id);
  }

  // Editing one leg of a shared bill breaks the guarantee that all the shares add
  // back up to the total, so the split's grouping is dissolved. Every transaction
  // and credit survives as a standalone record — only the header goes.
  if (prevSplit) {
    txn.split = null;
    await unlinkSplitForTransaction(uid, prevSplit);
  }
  await txn.save();

  const populated = await txn.populate(POPULATE);
  res.json(populated);
}

export async function deleteTransaction(req: Request, res: Response) {
  const uid = userId(req);
  const txn = await Transaction.findOne({ _id: req.params.id, user: uid });
  if (!txn) throw new HttpError(404, "Transaction not found");

  // A stock leg is derived from a purchase or sale, not the other way round.
  // Deleting it here would leave the lot alive with its cash movement gone, and
  // the Stock Investments bucket would quietly stop matching the cost basis of
  // open lots. Unlike a loan payment there is nothing sensible to reverse — the
  // shares would still exist — so this is refused rather than cascaded, and the
  // user is pointed at the record that actually owns it.
  assertNotStockLinked(txn, "delete");

  // Removing one leg of a shared bill leaves the remaining shares no longer adding
  // up to the total, so the split's grouping dissolves first (no money moves — see
  // unlinkSplitForTransaction). Deleting the WHOLE bill is DELETE /splits/:id,
  // which is what the collapsed split row in the ledger calls.
  const splitId = await splitIdForTransaction(uid, txn);
  if (splitId) await unlinkSplitForTransaction(uid, splitId);

  // Loan/goal/credit-linked transactions carry stored side effects (a loan's outstanding,
  // a goal's saved total, a paired Credit entry) that can't be cleanly reconstructed on
  // restore — so they're still removed permanently, reversing those effects exactly as before.
  if (txn.loan || txn.goal || txn.credit) {
    await Transaction.deleteOne({ _id: txn._id });
    if (txn.loan) await reverseLoanPayment(txn.loan, uid, txn.loanPrincipal ?? txn.amount, txn.loanInterest ?? 0);
    if (txn.goal) await reverseGoalContribution(txn.goal, uid, txn.goalContribution ?? txn.amount);
    if (txn.credit) await deleteCreditForTransaction(uid, txn.credit);
    return res.json({ ok: true, recoverable: false });
  }

  // Everything else is side-effect-free (balances are derived from transactions), so
  // a soft delete is enough: hidden everywhere, restorable, purged after the window.
  txn.deletedAt = new Date();
  await txn.save();
  res.json({ ok: true, recoverable: true, id: String(txn._id) });
}

/** List the user's soft-deleted transactions (the "Recently deleted" trash), newest first. */
export async function listDeletedTransactions(req: Request, res: Response) {
  const items = await Transaction.find({ user: userId(req), deletedAt: { $ne: null } })
    .setOptions({ withDeleted: true })
    .sort({ deletedAt: -1 })
    .limit(200)
    .populate(POPULATE)
    .lean();
  res.json(items);
}

/** Restore a soft-deleted transaction back into the ledger. */
export async function restoreTransaction(req: Request, res: Response) {
  const txn = await Transaction.findOne({ _id: req.params.id, user: userId(req), deletedAt: { $ne: null } })
    .setOptions({ withDeleted: true });
  if (!txn) throw new HttpError(404, "Deleted transaction not found");
  txn.deletedAt = null;
  await txn.save();
  const populated = await txn.populate(POPULATE);
  res.json(populated);
}
